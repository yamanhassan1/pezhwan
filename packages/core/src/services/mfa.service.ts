/**
 * PEZHWAN — MFA (TOTP) service.
 *
 * Implements RFC 6238 TOTP as the primary second factor, plus single-use
 * backup codes for recovery. Secret handling:
 *   - TOTP secret: generated here, encrypted on the user (select:false),
 *     provisioned to the authenticator via an otpauth:// URI.
 *   - Backup codes: generated as high-entropy strings; only SHA-256 hashes are
 *     stored.
 * Verification is constant-time and clock-skew tolerant.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { AuthenticationError, ValidationError } from '@pezhwan/shared';
import {
  generateToptSecretBytes,
  buildOtpauthUri,
  verifyTotp,
  generateTotp,
  generateBackupCodes,
  encodeBase32,
} from '@pezhwan/crypto';
import { UserModel } from '../models/index.ts';
import { BackupCodeModel } from '../models/index.ts';
import type { AuditService } from './audit.service.ts';
import { AUDIT_EVENT } from '@pezhwan/shared';

export interface MfaSetupResult {
  secret: string; // base32, for the authenticator app
  otpauthUri: string;
  backupCodes: string[];
}

/** Max failed MFA challenges before the user/account is temporarily locked out. */
const MFA_MAX_ATTEMPTS = 5;
/** Lockout duration after exhausting MFA attempts (brute-force throttle). */
const MFA_LOCK_MS = 15 * 60_000;

export class MfaService {
  constructor(
    private readonly tenantId: string,
    private readonly applicationId: string,
    private readonly audit?: AuditService,
    private readonly encryptionKey?: string | Buffer,
  ) {
    if (encryptionKey !== undefined) {
      const key = Buffer.isBuffer(encryptionKey)
        ? encryptionKey
        : Buffer.from(encryptionKey, 'base64');
      if (key.length !== 32) {
        throw new ValidationError(
          'MFA encryption key must be 32 bytes',
          'INVALID_MFA_ENCRYPTION_KEY',
        );
      }
    }
  }

  private protectSecret(secret: Buffer): string {
    if (!this.encryptionKey) {
      throw new ValidationError(
        'MFA encryption is not configured',
        'MFA_ENCRYPTION_NOT_CONFIGURED',
      );
    }
    const key = Buffer.isBuffer(this.encryptionKey)
      ? this.encryptionKey
      : Buffer.from(this.encryptionKey, 'base64');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
  }

  private revealSecret(value: string): Buffer {
    if (!this.encryptionKey) {
      throw new ValidationError(
        'MFA encryption is not configured',
        'MFA_ENCRYPTION_NOT_CONFIGURED',
      );
    }
    const key = Buffer.isBuffer(this.encryptionKey)
      ? this.encryptionKey
      : Buffer.from(this.encryptionKey, 'base64');
    const payload = Buffer.from(value, 'base64');
    if (payload.length < 28) {
      throw new ValidationError('Invalid MFA secret', 'INVALID_MFA_SECRET');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([
      decipher.update(payload.subarray(28)),
      decipher.final(),
    ]);
  }

  private hashBackupCode(code: string): string {
    return createHash('sha256').update(code).digest('base64');
  }

  private matchHashes(aHash: string, code: string): boolean {
    const a = Buffer.from(aHash, 'base64');
    const b = createHash('sha256').update(code).digest();
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Start MFA setup: generate a secret + provisioning URI + a backup-code batch. */
  async beginSetup(userId: string): Promise<MfaSetupResult> {
    const user = await UserModel.findById(userId).select('email mfaSecret mfaEnabled').lean();
    if (!user) {
      throw new ValidationError('User not found', 'USER_NOT_FOUND');
    }
    if (user.mfaEnabled) {
      throw new ValidationError('MFA is already enabled', 'MFA_ALREADY_ENABLED');
    }

    const secret = generateToptSecretBytes(32);
    const base32 = encodeBase32(secret);
    const otpauthUri = buildOtpauthUri({
      issuer: this.tenantId,
      accountName: user.email ?? String(userId),
      secret,
    });

    // Persist pending secret (verified flag stays off until confirmed).
    await UserModel.updateOne(
      { _id: userId },
      {
        mfaSecret: this.protectSecret(secret),
        mfaSecretVerifiedAt: null,
      },
    );

    // Issue one batch of backup codes (hashes stored).
    const backupCodes = generateBackupCodes(10, 10);
    await BackupCodeModel.deleteMany({ userId, tenantId: this.tenantId });
    await BackupCodeModel.insertMany(
      backupCodes.map((c) => ({
        userId,
        tenantId: this.tenantId,
        codeHash: this.hashBackupCode(c),
        usedAt: null,
      })),
    );

    await this.audit?.log({
      eventType: AUDIT_EVENT.BACKUP_CODES_GENERATED,
      tenantId: this.tenantId,
      applicationId: this.applicationId,
      userId,
    });

    return { secret: base32, otpauthUri, backupCodes };
  }

  /** Activate MFA after the user confirms their TOTP code. */
  async enable(userId: string, code: string): Promise<void> {
    const user = await UserModel.findById(userId).select('mfaSecret mfaEnabled').lean();
    if (!user?.mfaSecret) {
      throw new ValidationError('No pending MFA setup', 'MFA_SETUP_REQUIRED');
    }
    if (user.mfaEnabled) {
      throw new ValidationError('MFA is already enabled', 'MFA_ALREADY_ENABLED');
    }
    const secret = this.revealSecret(user.mfaSecret);
    if (!this.verify(secret, code)) {
      throw new AuthenticationError('Invalid authenticator code', 'INVALID_TOTP');
    }
    await UserModel.updateOne(
      { _id: userId },
      { mfaEnabled: true, mfaSecretVerifiedAt: Date.now() },
    );
    await this.audit?.log({
      eventType: AUDIT_EVENT.MFA_ENABLED,
      tenantId: this.tenantId,
      applicationId: this.applicationId,
      userId,
    });
  }

  /** Verify a TOTP or backup code during a step-up / login MFA challenge. */
  async verifyMfa(userId: string, code: string): Promise<boolean> {
    // Fail closed while the user is locked out: no code is accepted until the
    // lock window elapses, so an attacker cannot grind through the budget.
    if (await this.mfaLocked(userId)) {
      return false;
    }
    const user = await UserModel.findById(userId)
      .select('mfaEnabled mfaSecret')
      .lean();
    if (!user?.mfaEnabled || !user.mfaSecret) {
      return false;
    }
    const secret = this.revealSecret(user.mfaSecret);
    if (this.verify(secret, code)) {
      await this.touchVerified(userId);
      await this.resetMfaFailures(userId);
      return true;
    }
    // Try a backup code.
    const used = await this.tryBackupCode(userId, code);
    if (used) {
      await this.touchVerified(userId);
      await this.resetMfaFailures(userId);
      return true;
    }
    await this.recordMfaFailure(userId);
    return false;
  }

  private async touchVerified(userId: string): Promise<void> {
    await UserModel.updateOne(
      { _id: userId },
      { mfaSecretVerifiedAt: Date.now() },
    );
  }

  /**
   * Durable per-user MFA brute-force throttle. Fail closed: while locked, ALL
   * code attempts are rejected (even a correct one) so an attacker cannot
   * guess past the budget. Counter + lock persist on the user document so they
   * survive restarts and are shared across instances.
   */
  private async mfaLocked(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId)
      .select('mfaFailedAttempts mfaLockUntil')
      .lean();
    if (!user) {
      return false;
    }
    const until =
      user.mfaLockUntil && user.mfaLockUntil instanceof Date
        ? user.mfaLockUntil.getTime()
        : Number(user.mfaLockUntil);
    if (until > 0 && until > Date.now()) {
      return true;
    }
    if (until > 0) {
      // Lock expired — reset so the user gets a fresh budget.
      await UserModel.updateOne(
        { _id: userId },
        { mfaFailedAttempts: 0, mfaLockUntil: null },
      );
    }
    return false;
  }

  /** Atomically count one failed MFA challenge; cross the threshold → lock. */
  private async recordMfaFailure(userId: string): Promise<void> {
    const updated = await UserModel.findOneAndUpdate(
      { _id: userId },
      { $inc: { mfaFailedAttempts: 1 } },
      { new: true, projection: { mfaFailedAttempts: 1, mfaLockUntil: 1 } },
    );
    if (updated && (updated.mfaFailedAttempts ?? 0) >= MFA_MAX_ATTEMPTS) {
      await UserModel.updateOne(
        { _id: userId },
        { mfaLockUntil: new Date(Date.now() + MFA_LOCK_MS) },
      );
    }
  }

  /** Clear the failure counter on a successful MFA challenge. */
  private async resetMfaFailures(userId: string): Promise<void> {
    await UserModel.updateOne(
      { _id: userId, mfaFailedAttempts: { $gt: 0 } },
      { mfaFailedAttempts: 0, mfaLockUntil: null },
    );
  }

  private async tryBackupCode(userId: string, code: string): Promise<boolean> {
    const hashes = await BackupCodeModel.find({
      userId,
      usedAt: null,
    }).select('codeHash _id');
    for (const row of hashes) {
      if (this.matchHashes(row.codeHash, code)) {
        await BackupCodeModel.updateOne(
          { _id: row._id },
          { usedAt: new Date() },
        );
        await this.audit?.log({
          eventType: AUDIT_EVENT.BACKUP_CODE_USED,
          tenantId: this.tenantId,
          applicationId: this.applicationId,
          userId,
        });
        return true;
      }
    }
    return false;
  }

  /** Validate a raw TOTP code against a base64 secret (constant time, skew ±1 step). */
  verify(secret: Buffer, code: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    return verifyTotp(code, secret, now);
  }

  /** Compute the current TOTP for an arbitrary secret (used by the setup confirm). */
  computeFor(secret: Buffer): string {
    return generateTotp(secret, Math.floor(Date.now() / 1000));
  }

  /** How many backup codes remain for a user (for UI). */
  async remainingBackupCodes(userId: string): Promise<number> {
    return BackupCodeModel.countDocuments({ userId, usedAt: null });
  }

  /** Disable MFA (requires a valid current code to prevent lockout bypass). */
  async disable(userId: string, code: string): Promise<void> {
    const user = await UserModel.findById(userId)
      .select('mfaEnabled mfaSecret')
      .lean();
    if (!user?.mfaEnabled) {
      throw new ValidationError('MFA is not enabled', 'MFA_NOT_ENABLED');
    }
    // While locked, refuse to accept any code — including a valid one — so a
    // stolen code cannot be used to disable MFA and drop the second factor.
    if (await this.mfaLocked(userId)) {
      throw new AuthenticationError('Invalid code', 'INVALID_TOTP');
    }
    const secret = user.mfaSecret ? this.revealSecret(user.mfaSecret) : null;
    let ok = false;
    if (secret) {
      ok = this.verify(secret, code);
    }
    if (!ok) {
      ok = await this.tryBackupCode(userId, code);
    }
    if (!ok) {
      await this.recordMfaFailure(userId);
      throw new AuthenticationError('Invalid code', 'INVALID_TOTP');
    }
    await this.resetMfaFailures(userId);
    await UserModel.updateOne(
      { _id: userId },
      { mfaEnabled: false, mfaSecret: null, mfaSecretVerifiedAt: null },
    );
    await BackupCodeModel.deleteMany({ userId });
    await this.audit?.log({
      eventType: AUDIT_EVENT.MFA_DISABLED,
      tenantId: this.tenantId,
      applicationId: this.applicationId,
      userId,
    });
  }

  /** Whether the user has MFA enabled (for auth pipeline gating). */
  async isEnabled(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId).select('mfaEnabled').lean();
    return Boolean(user?.mfaEnabled);
  }
}
