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

import { createDecipheriv, createHash, timingSafeEqual } from 'node:crypto';
import { AuthenticationError, ValidationError } from '@pezhwan/shared';
import {
  generateToptSecretBytes,
  buildOtpauthUri,
  verifyTotp,
  generateTotp,
  generateBackupCodes,
  encodeBase32,
  envelopeEncrypt,
  envelopeDecrypt,
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

/**
 * Envelope-encryption version prefixes stored in `user.mfaSecret`.
 *
 * - `v3:` — CURRENT. True DEK envelope (random data key wrapped by the master
 *   key; the ciphertext is encrypted under the DEK). Satisfies the G3 carve-out
 *   (field-level envelope encryption) so the DB contents stay confidential even
 *   if the DB / backups sit outside the key trust boundary.
 * - `v2:` — PREVIOUS. Single-layer AES-256-GCM under the master key. Still
 *   decryptable during the migration window; new writes use `v3:`.
 * - unprefixed — LEGACY. Pre-versioning single-layer envelope; still decryptable
 *   so operators can migrate old records (see operations/mfa-migration.md).
 *
 * At-rest layout of a `v3:` value (base64 of the concatenation):
 *   ciphertext IV(12) + ciphertext auth tag(16) + ciphertext + encrypted DEK(60)
 * where the encrypted DEK is itself `dataKey IV(12) + auth tag(16) + DEK(32)`
 * wrapped by the master key.
 */
const MFA_ENVELOPE_VERSION = 'v3:';
const MFA_PREVIOUS_ENVELOPE_VERSION = 'v2:';
/** Domain-separation AAD bound to the ciphertext so a wrapping key can never
 * be replayed against another record type (e.g. signing PEMs). */
const MFA_ENVELOPE_AAD = Buffer.from('pezhwan:mfa-secret:v1');

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

  private get masterKey(): Buffer {
    if (!this.encryptionKey) {
      throw new ValidationError(
        'MFA encryption is not configured',
        'MFA_ENCRYPTION_NOT_CONFIGURED',
      );
    }
    const key = Buffer.isBuffer(this.encryptionKey)
      ? this.encryptionKey
      : Buffer.from(this.encryptionKey, 'base64');
    if (key.length !== 32) {
      throw new ValidationError('Invalid MFA encryption key', 'INVALID_MFA_ENCRYPTION_KEY');
    }
    return key;
  }

  /**
   * Wrap a TOTP secret with the CURRENT envelope scheme: a true DEK envelope
   * (`v3:` prefix). A random data key encrypts the secret (AES-256-GCM) and is
   * itself wrapped by the master key — so the stored value stays confidential
   * even if the database or a backup leaves the key trust boundary, and a
   * future master-key rotation only needs to re-wrap DEKs, not re-encrypt.
   */
  private wrapEnvelope(secret: Buffer): string {
    const master = this.masterKey;
    const sealed = envelopeEncrypt(secret, master, MFA_ENVELOPE_AAD);
    const payload = Buffer.concat([
      sealed.encrypted.iv,
      sealed.encrypted.authTag,
      sealed.encrypted.ciphertext,
      sealed.encryptedDataKey,
    ]);
    return `${MFA_ENVELOPE_VERSION}${payload.toString('base64')}`;
  }

  /**
   * Decrypt a stored secret. Accepts the current `v3:` DEK envelope PLUS the
   * `v2:` and legacy unprefixed single-layer envelopes, so records written
   * before the envelope upgrade stay decryptable for the whole migration
   * window (see operations/mfa-migration.md). Fails closed on anything that is
   * not a valid envelope under the configured key.
   */
  private unwrap(value: string): Buffer {
    const master = this.masterKey;
    if (value.startsWith(MFA_ENVELOPE_VERSION)) {
      const payload = Buffer.from(value.slice(MFA_ENVELOPE_VERSION.length), 'base64');
      // Layout: iv(12) + tag(16) + ciphertext + encryptedDataKey(12+16+32).
      const MIN_ENVELOPE = 12 + 16 + 60;
      if (payload.length < MIN_ENVELOPE) {
        throw new ValidationError('Invalid MFA secret', 'INVALID_MFA_SECRET');
      }
      const encryptedDataKey = payload.subarray(payload.length - 60);
      return envelopeDecrypt(
        {
          encrypted: {
            ciphertext: payload.subarray(28, payload.length - 60),
            iv: payload.subarray(0, 12),
            authTag: payload.subarray(12, 28),
          },
          encryptedDataKey,
          dataKeyIv: encryptedDataKey.subarray(0, 12),
        },
        master,
        MFA_ENVELOPE_AAD,
      );
    }

    // Legacy `v2:` prefixed / unprefixed single-layer AES-256-GCM envelope.
    const raw = value.startsWith(MFA_PREVIOUS_ENVELOPE_VERSION)
      ? value.slice(MFA_PREVIOUS_ENVELOPE_VERSION.length)
      : value;
    const payload = Buffer.from(raw, 'base64');
    if (payload.length < 28) {
      throw new ValidationError('Invalid MFA secret', 'INVALID_MFA_SECRET');
    }
    const decipher = createDecipheriv('aes-256-gcm', master, payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]);
  }

  /**
   * Re-wrap a raw secret under the configured key (current `v3:` scheme).
   * Public so the MFA migration utility can validate new envelopes at batch
   * time.
   */
  encryptSecret(secret: Buffer): string {
    return this.wrapEnvelope(secret);
  }

  /**
   * Decrypt a wrapped secret under the configured key. Public so the MFA
   * migration utility can (a) validate migration and (b) detect legacy records.
   * Accepts `v3:` / `v2:` / legacy unprefixed envelopes.
   * Throws INVALID_MFA_SECRET when the value is not a valid envelope.
   */
  decryptSecret(value: string): Buffer {
    return this.unwrap(value);
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
        mfaSecret: this.wrapEnvelope(secret),
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
    const secret = this.unwrap(user.mfaSecret);
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
    const user = await UserModel.findById(userId).select('mfaEnabled mfaSecret').lean();
    if (!user?.mfaEnabled || !user.mfaSecret) {
      return false;
    }
    const secret = this.unwrap(user.mfaSecret);
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
    await UserModel.updateOne({ _id: userId }, { mfaSecretVerifiedAt: Date.now() });
  }

  /**
   * Durable per-user MFA brute-force throttle. Fail closed: while locked, ALL
   * code attempts are rejected (even a correct one) so an attacker cannot
   * guess past the budget. Counter + lock persist on the user document so they
   * survive restarts and are shared across instances.
   */
  private async mfaLocked(userId: string): Promise<boolean> {
    const user = await UserModel.findById(userId).select('mfaFailedAttempts mfaLockUntil').lean();
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
      await UserModel.updateOne({ _id: userId }, { mfaFailedAttempts: 0, mfaLockUntil: null });
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
        await BackupCodeModel.updateOne({ _id: row._id }, { usedAt: new Date() });
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
    const user = await UserModel.findById(userId).select('mfaEnabled mfaSecret').lean();
    if (!user?.mfaEnabled) {
      throw new ValidationError('MFA is not enabled', 'MFA_NOT_ENABLED');
    }
    // While locked, refuse to accept any code — including a valid one — so a
    // stolen code cannot be used to disable MFA and drop the second factor.
    if (await this.mfaLocked(userId)) {
      throw new AuthenticationError('Invalid code', 'INVALID_TOTP');
    }
    const secret = user.mfaSecret ? this.unwrap(user.mfaSecret) : null;
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
