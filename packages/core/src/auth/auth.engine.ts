/**
 * PEZHWAN — auth engine.
 *
 * The orchestration layer for all authentication flows. Controllers (Express
 * or otherwise) call these methods; the engine wires together password
 * hashing, OTP, sessions, tokens, account state, and audit.
 *
 * Applications never implement auth logic themselves — they call the engine.
 */

import {
  AuthenticationError,
  ValidationError,
  AUDIT_EVENT,
} from '@pezhwan/shared';
import type { AuthMethod, IdentityContext, OtpChannel, OtpPurpose } from '@pezhwan/shared';
import {
  hashPassword,
  verifyPassword,
  generateOtp,
  hashOtp,
  verifyOtp as verifyOtpCode,
  isArgon2Hash,
} from '@pezhwan/crypto';
import type { RedisCache } from '../services/redisCache.ts';
import type { TokenService, TokenPair } from '../services/token.service.ts';
import type { SessionService, CreatedSession, SessionContext } from '../services/session.service.ts';
import type { OtpService } from '../services/otp.service.ts';
import type { AccountStateService } from '../services/accountState.service.ts';
import type { AuthorizationService } from '../services/authorization.service.ts';
import type { AuditService } from '../services/audit.service.ts';
import type { MfaService } from '../services/mfa.service.ts';
import type { VerificationTokenService } from '../services/verificationToken.service.ts';
import type { PasswordPolicy } from '../services/password.service.ts';
import { evaluatePassword, DEFAULT_PASSWORD_POLICY } from '../services/password.service.ts';
import { UserModel, type UserDoc } from '../models/index.ts';
import type { Types } from 'mongoose';

export interface UserCreateInput {
  tenantId: string;
  applicationId: string;
  email?: string;
  phone?: string;
  password?: string;
  metadata?: Record<string, unknown>;
}

export interface UserLookupInput {
  tenantId?: string;
  applicationId?: string;
  email?: string;
  phone?: string;
  userId?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  session: CreatedSession;
}

export interface LoginResult {
  mfaRequired: boolean;
  userId?: string;
  user?: UserDoc;
  tokens?: IssuedTokens;
}

export interface OtpDeliveryCallbacks {
  sendEmail(target: string, code: string, purpose: OtpPurpose): Promise<void>;
  sendSms?(target: string, code: string, purpose: OtpPurpose): Promise<void>;
}

export interface AuthEngineOptions {
  tenantId: string;
  applicationId: string;
  issuer: string;
  audience: string;
  accessTokenTtlMs: number;
  passwordPolicy?: PasswordPolicy;
  otp: {
    codeLength?: number;
    ttlMs: number;
    maxAttempts: number;
    resendCooldownMs: number;
    attemptsWindowMs: number;
    delivery: OtpDeliveryCallbacks;
  };
}

/** How the engine finds the account for a given identity handle. */
export type LookupUserFn = (
  input: UserLookupInput,
) => Promise<UserDoc | null>;

const DEFAULT_LOOKUP: LookupUserFn = async (input) => {
  let query: Record<string, unknown> = { tenantId: input.tenantId };
  if (input.userId) {
    query = { ...query, _id: input.userId };
  } else if (input.email) {
    query = { ...query, email: input.email.toLowerCase() };
  } else if (input.phone) {
    query = { ...query, phone: input.phone };
  }
  return UserModel.findOne(query).lean();
};

export interface AuthEngineDeps {
  tokens: TokenService;
  sessions: SessionService;
  cache: RedisCache;
  otp: OtpService;
  accountState: AccountStateService;
  authorization: AuthorizationService;
  audit?: AuditService;
  mfa?: MfaService;
  verificationTokens: VerificationTokenService;
  lookupUser?: LookupUserFn;
}

export class AuthEngine {
  private readonly audit?: AuditService;
  private readonly passwordPolicy: PasswordPolicy;

  constructor(
    private readonly deps: AuthEngineDeps,
    private readonly options: AuthEngineOptions,
  ) {
    this.audit = deps.audit;
    this.passwordPolicy = options.passwordPolicy ?? DEFAULT_PASSWORD_POLICY;
  }

  private deviceFrom(
    ctx: { ip?: string; userAgent?: string; deviceLabel?: string },
  ): SessionContext {
    return {
      userId: this.options.applicationId, // placeholder; overridden by callers with user context
      tenantId: this.options.tenantId,
      applicationId: this.options.applicationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      deviceLabel: ctx.deviceLabel,
    };
  }

  private async buildIdentity(
    user: { _id: string | Types.ObjectId },
    sessionId: string,
    authMethod: AuthMethod,
    applicationId: string,
  ): Promise<IdentityContext> {
    return this.deps.authorization.buildIdentityContext({
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId,
      sessionId,
      authMethod,
    });
  }

  private async mintTokens(
    user: { _id: string | Types.ObjectId; tokenVersion?: number },
    session: CreatedSession,
    applicationId: string,
    authMethod: AuthMethod,
  ): Promise<IssuedTokens> {
    const identity = await this.buildIdentity(
      user,
      session.sessionId,
      authMethod,
      applicationId,
    );
    const accessToken = this.deps.tokens.signAccessToken({
      ...identity,
      tokenVersion: user.tokenVersion ?? 0,
    });
    return {
      accessToken,
      refreshToken: session.refreshToken,
      session,
    };
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  async register(
    input: UserCreateInput & {
      metadata?: Record<string, unknown>;
      device?: { ip?: string; userAgent?: string; deviceLabel?: string };
      applicationId: string;
    },
  ): Promise<{ user: UserDoc; tokens: IssuedTokens }> {
    if (!input.email && !input.phone) {
      throw new ValidationError(
        'At least one identity handle (email or phone) is required',
        'IDENTITY_HANDLE_REQUIRED',
      );
    }
    if (input.password) {
      const result = evaluatePassword(input.password, this.passwordPolicy);
      if (!result.ok) {
        throw new ValidationError(
          result.errors.join(' '),
          'PASSWORD_POLICY',
        );
      }
    } else if (!input.phone) {
      throw new ValidationError(
        'Password is required for email registration',
        'PASSWORD_REQUIRED',
      );
    }

    const passwordHash = input.password
      ? await hashPassword(input.password)
      : null;

    const doc = await UserModel.create({
      tenantId: input.tenantId,
      email: input.email?.toLowerCase(),
      phone: input.phone,
      passwordHash,
      emailVerified: false,
      phoneVerified: false,
      isActive: true,
      tokenVersion: 0,
      metadata: input.metadata ?? {},
    });

    const session = await this.deps.sessions.create({
      userId: String(doc._id),
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      userAgent: input.device?.userAgent,
      deviceLabel: input.device?.deviceLabel,
    });
    const tokens = await this.mintTokens(
      doc,
      session,
      input.applicationId,
      input.password ? 'password' : 'phone_otp',
    );

    await this.audit?.log({
      eventType: AUDIT_EVENT.USER_REGISTERED,
      userId: String(doc._id),
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      metadata: { channel: input.email ? 'email' : 'phone' },
    });

    return { user: doc.toObject?.() ?? (doc as unknown as UserDoc), tokens };
  }

  // -------------------------------------------------------------------------
  // Login (password)
  // -------------------------------------------------------------------------

  async loginPassword(input: {
    applicationId: string;
    email?: string;
    phone?: string;
    password: string;
    device?: { ip?: string; userAgent?: string; deviceLabel?: string };
  }): Promise<LoginResult> {
    const user = await this.findUser({
      email: input.email,
      phone: input.phone,
    });
    if (!user) {
      throw new AuthenticationError(
        'Invalid credentials',
        'INVALID_CREDENTIALS',
      );
    }
    if (user.loginLockUntil && new Date(user.loginLockUntil) > new Date()) {
      throw new AuthenticationError(
        'Account temporarily locked',
        'ACCOUNT_LOCKED',
        { details: { retryAfterMs: +user.loginLockUntil - Date.now() } },
      );
    }
    if (!user.passwordHash || !isArgon2Hash(user.passwordHash)) {
      throw new AuthenticationError(
        'Invalid credentials',
        'INVALID_CREDENTIALS',
      );
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      await this.recordFailedLogin(user);
      throw new AuthenticationError(
        'Invalid credentials',
        'INVALID_CREDENTIALS',
      );
    }
    if (!user.isActive) {
      throw new AuthenticationError(
        'Account disabled',
        'ACCOUNT_DISABLED',
      );
    }
    await this.clearFailedLogin(user);

    // MFA gateway: if the user has TOTP enabled, the password is valid but we
    // do NOT issue tokens until a second factor is presented.
    if (this.deps.mfa && await this.deps.mfa.isEnabled(String(user._id))) {
      await this.audit?.log({
        eventType: AUDIT_EVENT.LOGIN_SUCCESS,
        userId: String(user._id),
        tenantId: this.options.tenantId,
        applicationId: input.applicationId,
        ip: input.device?.ip,
        metadata: { authMethod: 'password', mfaPending: true },
      });
      return { mfaRequired: true, userId: String(user._id), user };
    }

    return {
      mfaRequired: false,
      ...(await this.completeLogin(
        user,
        'password',
        input.applicationId,
        input.device,
      )),
    };
  }

  // -------------------------------------------------------------------------
  // Login (OTP)
  // -------------------------------------------------------------------------

  async requestOtp(input: {
    applicationId: string;
    channel: OtpChannel;
    target: string;
    purpose: OtpPurpose;
    userId?: string;
  }): Promise<{ retryAfterSeconds?: number }> {
    const result = await this.deps.otp.requestOtp({
      channel: input.channel,
      target: input.target,
      purpose: input.purpose,
      userId: input.userId,
    });
    return { retryAfterSeconds: result.retryAfterSeconds };
  }

  /**
   * Generic OTP verification (purpose-driven) without issuing session tokens.
   * Used by the standalone /otp/verify endpoint; login / reset / verify-email
   * flows call their own specific methods.
   */
  async verifyOtp(input: {
    channel: OtpChannel;
    target: string;
    purpose: OtpPurpose;
    code: string;
  }): Promise<{ verified: boolean }> {
    return this.deps.otp.verifyOtp({
      channel: input.channel,
      target: input.target,
      purpose: input.purpose,
      code: input.code,
    });
  }

  async loginOtp(input: {
    applicationId: string;
    channel: OtpChannel;
    target: string;
    email?: string;
    phone?: string;
    code: string;
    device?: { ip?: string; userAgent?: string; deviceLabel?: string };
  }): Promise<LoginResult> {
    const verification = await this.deps.otp.verifyOtp({
      channel: input.channel,
      target: input.target,
      purpose: 'login',
      code: input.code,
    });
    if (!verification.verified) {
      throw new AuthenticationError(
        'Invalid or expired code',
        'INVALID_OTP',
      );
    }
    const user = await this.findUser({
      email: input.email,
      phone: input.phone,
    });
    if (!user) {
      throw new AuthenticationError(
        'Invalid or expired code',
        'INVALID_OTP',
      );
    }
    if (!user.isActive) {
      throw new AuthenticationError('Account disabled', 'ACCOUNT_DISABLED');
    }

    // MFA gateway for passwordless OTP login too.
    if (this.deps.mfa && await this.deps.mfa.isEnabled(String(user._id))) {
      await this.audit?.log({
        eventType: AUDIT_EVENT.LOGIN_SUCCESS,
        userId: String(user._id),
        tenantId: this.options.tenantId,
        applicationId: input.applicationId,
        ip: input.device?.ip,
        metadata: { authMethod: 'email_otp', mfaPending: true },
      });
      return { mfaRequired: true, userId: String(user._id), user };
    }

    return {
      mfaRequired: false,
      ...(await this.completeLogin(
        user,
        'email_otp',
        input.applicationId,
        input.device,
      )),
    };
  }

  /**
   * Complete an MFA-challenged login. Called after `loginPassword`/`loginOtp`
   * returned `mfaRequired: true`; verifies the TOTP (or backup code) and only
   * then issues tokens.
   */
  async verifyMfaLogin(input: {
    userId: string;
    applicationId: string;
    code: string;
    device?: { ip?: string; userAgent?: string; deviceLabel?: string };
  }): Promise<{ user: UserDoc; tokens: IssuedTokens }> {
    if (!this.deps.mfa) {
      throw new AuthenticationError(
        'MFA is not configured on this server',
        'MFA_NOT_CONFIGURED',
      );
    }
    const ok = await this.deps.mfa.verifyMfa(input.userId, input.code);
    if (!ok) {
      await this.audit?.log({
        eventType: AUDIT_EVENT.MFA_CHALLENGE_FAILED,
        userId: input.userId,
        tenantId: this.options.tenantId,
        applicationId: input.applicationId,
        metadata: { authMethod: 'mfa_totp' },
      });
      throw new AuthenticationError('Invalid MFA code', 'INVALID_MFA_CODE');
    }

    const user = await this.findUserById(input.userId);
    if (!user || user.isActive === false) {
      throw new AuthenticationError('Account disabled', 'ACCOUNT_DISABLED');
    }
    const userDoc = await this.findUser({ userId: input.userId });
    if (!userDoc) {
      throw new AuthenticationError('User not found', 'USER_NOT_FOUND');
    }

    const session = await this.deps.sessions.create({
      userId: input.userId,
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      userAgent: input.device?.userAgent,
      deviceLabel: input.device?.deviceLabel,
    });
    const tokens = await this.mintTokens(
      userDoc,
      session,
      input.applicationId,
      'mfa_totp',
    );

    await this.audit?.log({
      eventType: AUDIT_EVENT.MFA_CHALLENGE_SUCCESS,
      userId: input.userId,
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      metadata: { authMethod: 'mfa_totp' },
    });
    await this.audit?.log({
      eventType: AUDIT_EVENT.LOGIN_SUCCESS,
      userId: input.userId,
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      metadata: { authMethod: 'mfa_totp' },
    });
    return { user: userDoc, tokens };
  }

  // -------------------------------------------------------------------------
  // Shared login completion
  // -------------------------------------------------------------------------

  private async completeLogin(
    user: UserDoc,
    authMethod: AuthMethod,
    applicationId: string,
    device?: { ip?: string; userAgent?: string; deviceLabel?: string },
  ): Promise<{ user: UserDoc; tokens: IssuedTokens }> {
    const session = await this.deps.sessions.create({
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId,
      ip: device?.ip,
      userAgent: device?.userAgent,
      deviceLabel: device?.deviceLabel,
    });
    const tokens = await this.mintTokens(user, session, applicationId, authMethod);

    await this.audit?.log({
      eventType: AUDIT_EVENT.LOGIN_SUCCESS,
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId,
      ip: device?.ip,
      metadata: { authMethod },
    });
    return { user, tokens };
  }

  private async recordFailedLogin(user: UserDoc): Promise<void> {
    const next = (user.failedLoginAttempts ?? 0) + 1;
    const lockAt = next >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
    await UserModel.updateOne(
      { _id: user._id },
      { failedLoginAttempts: next, loginLockUntil: lockAt },
    );
    await this.audit?.log({
      eventType: AUDIT_EVENT.LOGIN_FAILED,
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId: this.options.applicationId,
      metadata: { attempts: next, locked: Boolean(lockAt) },
    });
    if (lockAt) {
      await this.audit?.log({
        eventType: AUDIT_EVENT.ACCOUNT_LOCKED,
        userId: String(user._id),
        tenantId: this.options.tenantId,
        applicationId: this.options.applicationId,
      });
    }
  }

  private async clearFailedLogin(user: UserDoc): Promise<void> {
    await UserModel.updateOne(
      { _id: user._id },
      { failedLoginAttempts: 0, loginLockUntil: null },
    );
  }

  // -------------------------------------------------------------------------
  // Sessions & tokens
  // -------------------------------------------------------------------------

  async refreshSession(
    presentedRefreshToken: string,
    device?: { ip?: string; userAgent?: string; deviceLabel?: string },
  ): Promise<{ refreshToken: string; accessToken: string; session: CreatedSession }> {
    const session = await this.deps.sessions.refresh(presentedRefreshToken, {
      ip: device?.ip,
      userAgent: device?.userAgent,
      deviceLabel: device?.deviceLabel,
    });

    // Re-resolve roles/permissions for the newest access token.
    const identity = await this.deps.authorization.buildIdentityContext({
      userId: session.userId,
      tenantId: this.options.tenantId,
      applicationId: this.options.applicationId,
      sessionId: session.sessionId,
      authMethod: 'password',
    });

    const user = await this.findUserById(session.userId);
    const accessToken = this.deps.tokens.signAccessToken({
      ...identity,
      tokenVersion: user?.tokenVersion ?? 0,
    });
    return { refreshToken: session.refreshToken, accessToken, session };
  }

  // -------------------------------------------------------------------------
  // Password change / reset
  // -------------------------------------------------------------------------

  async changePassword(input: {
    userId: string;
    applicationId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const result = evaluatePassword(input.newPassword, this.passwordPolicy);
    if (!result.ok) {
      throw new ValidationError(result.errors.join(' '), 'PASSWORD_POLICY');
    }
    const user = await UserModel.findById(input.userId).select('passwordHash tokenVersion isActive');
    if (!user) {
      throw new AuthenticationError('User not found', 'USER_NOT_FOUND');
    }
    const ok = user.passwordHash
      ? await verifyPassword(input.currentPassword, user.passwordHash)
      : false;
    if (!ok) {
      throw new AuthenticationError(
        'Current password is incorrect',
        'INVALID_CURRENT_PASSWORD',
      );
    }
    const newHash = await hashPassword(input.newPassword);
    const nextVersion = (user.tokenVersion ?? 0) + 1;
    await UserModel.updateOne(
      { _id: user._id },
      { passwordHash: newHash, tokenVersion: nextVersion },
    );
    await this.deps.accountState.invalidate(String(user._id));
    await this.audit?.log({
      eventType: AUDIT_EVENT.PASSWORD_CHANGED,
      userId: input.userId,
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      metadata: { tokenVersion: nextVersion },
    });
  }

  async resetPassword(input: {
    applicationId: string;
    channel: OtpChannel;
    target: string;
    code: string;
    newPassword: string;
    device?: { ip?: string; userAgent?: string; deviceLabel?: string };
  }): Promise<{ user: UserDoc; tokens: IssuedTokens }> {
    const result = evaluatePassword(input.newPassword, this.passwordPolicy);
    if (!result.ok) {
      throw new ValidationError(result.errors.join(' '), 'PASSWORD_POLICY');
    }
    const verification = await this.deps.otp.verifyOtp({
      channel: input.channel,
      target: input.target,
      purpose: 'password_reset',
      code: input.code,
    });
    if (!verification.verified) {
      throw new AuthenticationError(
        'Invalid or expired code',
        'INVALID_OTP',
      );
    }
    const user = await this.findUser({
      email: input.channel === 'email' ? input.target : undefined,
      phone: input.channel === 'phone' ? input.target : undefined,
    });
    if (!user) {
      throw new AuthenticationError('Invalid or expired code', 'INVALID_OTP');
    }
    const newHash = await hashPassword(input.newPassword);
    const nextVersion = (user.tokenVersion ?? 0) + 1;
    await UserModel.updateOne(
      { _id: user._id },
      {
        passwordHash: newHash,
        tokenVersion: nextVersion,
        failedLoginAttempts: 0,
        loginLockUntil: null,
      },
    );
    await this.deps.accountState.invalidate(String(user._id));
    await this.deps.sessions.revokeAll(String(user._id), input.applicationId);

    const session = await this.deps.sessions.create({
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      userAgent: input.device?.userAgent,
      deviceLabel: input.device?.deviceLabel,
    });
    const tokens = await this.mintTokens(
      user,
      session,
      input.applicationId,
      'password',
    );

    await this.audit?.log({
      eventType: AUDIT_EVENT.PASSWORD_RESET,
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      metadata: { tokenVersion: nextVersion },
    });
    return { user, tokens };
  }

  // -------------------------------------------------------------------------
  // Magic-link + verification tokens
  // -------------------------------------------------------------------------

  /**
   * Issue a password-reset token. Enumeration-safe: unknown emails burn a
   * token issuance so responses stay indistinguishable.
   */
  async forgotPassword(input: {
    applicationId: string;
    email: string;
    redirectUri?: string;
  }): Promise<{ token?: string; expiresIn?: number }> {
    const user = await this.findUser({
      email: input.email.toLowerCase(),
    });
    const redirectUri = input.redirectUri ?? `${this.options.issuer}/v1/auth/password/reset/confirm`;
    if (!user) {
      // Burn the flow for unknown accounts (no-signal).
      return { token: this.decoysFor(input.email), expiresIn: 900 };
    }
    const { token, expiresIn } = await this.deps.verificationTokens.issue({
      kind: 'password_reset',
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      userId: String(user._id),
      target: input.email.toLowerCase(),
      redirectUri,
    });
    return { token, expiresIn };
  }

  /** Complete a password reset with a previously issued verification token. */
  async resetPasswordWithToken(input: {
    applicationId: string;
    token: string;
    newPassword: string;
    device?: { ip?: string; userAgent?: string; deviceLabel?: string };
  }): Promise<{ user: UserDoc; tokens: IssuedTokens }> {
    const result = evaluatePassword(input.newPassword, this.passwordPolicy);
    if (!result.ok) {
      throw new ValidationError(result.errors.join(' '), 'PASSWORD_POLICY');
    }
    const redeemed = await this.deps.verificationTokens.redeem(input.token);
    if (redeemed.kind !== 'password_reset') {
      throw new AuthenticationError(
        'Invalid or expired token',
        'INVALID_TOKEN',
      );
    }
    const user = await this.findUser({ userId: redeemed.userId });
    if (!user) {
      throw new AuthenticationError('User not found', 'USER_NOT_FOUND');
    }
    const newHash = await hashPassword(input.newPassword);
    const nextVersion = (user.tokenVersion ?? 0) + 1;
    await UserModel.updateOne(
      { _id: user._id },
      {
        passwordHash: newHash,
        tokenVersion: nextVersion,
        failedLoginAttempts: 0,
        loginLockUntil: null,
      },
    );
    await this.deps.accountState.invalidate(String(user._id));
    await this.deps.sessions.revokeAll(String(user._id), input.applicationId);

    const session = await this.deps.sessions.create({
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      userAgent: input.device?.userAgent,
      deviceLabel: input.device?.deviceLabel,
    });
    const tokens = await this.mintTokens(
      user,
      session,
      input.applicationId,
      'email_otp',
    );

    await this.audit?.log({
      eventType: AUDIT_EVENT.PASSWORD_RESET,
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      ip: input.device?.ip,
      metadata: { tokenVersion: nextVersion },
    });
    return { user, tokens };
  }

  /** Issue an email-verification token (post-registration). */
  async issueEmailVerification(input: {
    applicationId: string;
    email: string;
    redirectUri?: string;
  }): Promise<{ token?: string; expiresIn?: number }> {
    const user = await this.findUser({ email: input.email.toLowerCase() });
    if (!user) {
      return { token: this.decoysFor(input.email), expiresIn: 86400 };
    }
    const { token, expiresIn } = await this.deps.verificationTokens.issue({
      kind: 'email_verification',
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      userId: String(user._id),
      target: input.email.toLowerCase(),
      redirectUri: input.redirectUri,
    });
    return { token, expiresIn };
  }

  /** Complete email verification with a verification token. */
  async verifyEmailToken(input: {
    applicationId: string;
    token: string;
  }): Promise<void> {
    const redeemed = await this.deps.verificationTokens.redeem(input.token);
    if (redeemed.kind !== 'email_verification') {
      throw new AuthenticationError('Invalid or expired token', 'INVALID_TOKEN');
    }
    await UserModel.updateOne(
      { _id: redeemed.userId },
      { emailVerified: true },
    );
    await this.audit?.log({
      eventType: AUDIT_EVENT.EMAIL_VERIFIED,
      userId: redeemed.userId,
      tenantId: String(redeemed.tenantId),
      applicationId: String(redeemed.applicationId),
      metadata: { email: redeemed.target },
    });
  }

  /**
   * Issue a magic-link token + send it. The `sendMagicLink` delivery callback
   * is responsible for emailing the link; we return the raw token for
   * print-to-console/local dev setups too.
   */
  async sendMagicLink(input: {
    applicationId: string;
    email: string;
    redirectUri?: string;
  }): Promise<{ token?: string; expiresIn?: number }> {
    const user = await this.findUser({ email: input.email.toLowerCase() });
    if (!user) {
      return { token: this.decoysFor(input.email), expiresIn: 900 };
    }
    const { token, expiresIn } = await this.deps.verificationTokens.issue({
      kind: 'magic_link',
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      userId: String(user._id),
      target: input.email.toLowerCase(),
      redirectUri: input.redirectUri,
    });
    await this.audit?.log({
      eventType: AUDIT_EVENT.MAGIC_LINK_SENT,
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      metadata: { email: input.email.toLowerCase() },
    });
    return { token, expiresIn };
  }

  /** Redeem a magic link and log the user in. */
  async redeemMagicLink(input: {
    applicationId: string;
    token: string;
    device?: { ip?: string; userAgent?: string; deviceLabel?: string };
  }): Promise<{ user: UserDoc; tokens: IssuedTokens; redirectUri?: string }> {
    const redeemed = await this.deps.verificationTokens.redeem(input.token);
    if (redeemed.kind !== 'magic_link') {
      throw new AuthenticationError('Invalid or expired token', 'INVALID_TOKEN');
    }
    const user = await this.findUser({ userId: redeemed.userId });
    if (!user) {
      throw new AuthenticationError('User not found', 'USER_NOT_FOUND');
    }
    if (!user.isActive) {
      throw new AuthenticationError('Account disabled', 'ACCOUNT_DISABLED');
    }
    const session = await this.deps.sessions.create({
      userId: String(user._id),
      tenantId: String(redeemed.tenantId),
      applicationId: String(redeemed.applicationId),
      ip: input.device?.ip,
      userAgent: input.device?.userAgent,
      deviceLabel: input.device?.deviceLabel,
    });
    const tokens = await this.mintTokens(
      user,
      session,
      String(redeemed.applicationId),
      'magic_link',
    );
    await this.audit?.log({
      eventType: AUDIT_EVENT.MAGIC_LINK_VERIFIED,
      userId: String(user._id),
      tenantId: String(redeemed.tenantId),
      applicationId: String(redeemed.applicationId),
      ip: input.device?.ip,
    });
    return {
      user,
      tokens,
      redirectUri: redeemed.redirectUri,
    };
  }

  /**
   * Issue a fake token string so enumeration probes on unknown accounts get
   * the same token-shaped response as real accounts.
   */
  private decoysFor(target: string): string {
    const raw = `${target}:${Date.now()}`;
    const pad = Buffer.alloc(16);
    for (let i = 0; i < pad.length; i += 1) {
      pad[i] = (target.charCodeAt(i % target.length) ?? 0x41) & 0xff;
    }
    void raw;
    return Buffer.concat([
      pad,
      Buffer.from(String(Date.now())) as Buffer,
    ]).toString('base64url');
  }

  // -------------------------------------------------------------------------
  // Email verification
  // -------------------------------------------------------------------------

  async verifyEmail(input: {
    applicationId: string;
    email: string;
    code: string;
  }): Promise<void> {
    const verification = await this.deps.otp.verifyOtp({
      channel: 'email',
      target: input.email,
      purpose: 'verify_email',
      code: input.code,
    });
    if (!verification.verified) {
      throw new AuthenticationError(
        'Invalid or expired code',
        'INVALID_OTP',
      );
    }
    const user = await UserModel.findOne({
      tenantId: this.options.tenantId,
      email: input.email.toLowerCase(),
    });
    if (!user) {
      throw new AuthenticationError('User not found', 'USER_NOT_FOUND');
    }
    await UserModel.updateOne(
      { _id: user._id },
      { emailVerified: true },
    );
    await this.audit?.log({
      eventType: AUDIT_EVENT.EMAIL_VERIFIED,
      userId: String(user._id),
      tenantId: this.options.tenantId,
      applicationId: input.applicationId,
      metadata: { email: input.email },
    });
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async findUser(input: UserLookupInput): Promise<UserDoc | null> {
    if (this.deps.lookupUser) {
      return this.deps.lookupUser(input);
    }
    const query: Record<string, unknown> = { tenantId: this.options.tenantId };
    if (input.userId) {
      query._id = input.userId;
    } else if (input.email) {
      query.email = input.email.toLowerCase();
    } else if (input.phone) {
      query.phone = input.phone;
    }
    return UserModel.findOne(query).lean();
  }

  private async findUserById(userId: string): Promise<{
    tokenVersion?: number;
    isActive?: boolean;
  } | null> {
    return UserModel.findById(userId).select('tokenVersion isActive').lean();
  }

  /** Public helper so controllers don't need to wire token logic themselves. */
  verifyAccessToken(token: string): IdentityContext {
    return this.deps.tokens.verifyAccessToken(token);
  }
}