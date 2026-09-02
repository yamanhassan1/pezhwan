/**
 * PEZHWAN — One Identity. Every Application.
 *
 * Shared type definitions for the Pezhwan identity & access management SDK.
 * These interfaces are framework-independent and define the contracts that all
 * packages (@pezhwan/core, @pezhwan/express, @pezhwan/react, etc.) implement.
 */

// ---------------------------------------------------------------------------
// Core identity primitives
// ---------------------------------------------------------------------------

/** Supported identity/authentication methods. */
export type AuthMethod =
  | 'password'
  | 'email_otp'
  | 'phone_otp'
  | 'oauth'
  | 'oidc'
  | 'passkey'
  | 'mfa_totp'
  | 'magic_link'
  | 'api_key'
  | 'service';

/** JWT signing algorithms supported by the crypto layer. */
export type JwtAlgorithm = 'RS256' | 'ES256' | 'EdDSA' | 'HS256';

/** Severity levels for audit events. */
export type Severity = 'info' | 'warning' | 'critical';

/**
 * Lifecycle states of a session.
 *
 * `rotating` is a transient, internal state used to make refresh-token rotation
 * atomic: a refresh atomically claims the active parent by transitioning it to
 * `rotating`, so a concurrent duplicate refresh cannot also see it as `active`
 * (the reuse-detection barrier). It is never exposed to callers and resolves
 * immediately to `replaced` (or, on a crashed rotation, is treated as
 * consumed/reuse by subsequent requests).
 */
export type SessionStatus =
  | 'active'
  | 'rotating'
  | 'replaced'
  | 'revoked'
  | 'expired';

/** MIME or generic media types used to describe application registration. */
export type ApplicationPlatform = 'web' | 'mobile' | 'api' | 'service' | 'admin';

// ---------------------------------------------------------------------------
// Multi-tenancy
// ---------------------------------------------------------------------------

/** A tenant isolates users, roles, permissions, applications, and OAuth clients. */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/** A tenant-scoped registered application (e.g. transport-web, admin-dashboard). */
export interface Application {
  id: string;
  tenantId: string;
  name: string;
  platform: ApplicationPlatform;
  clientId: string;
  /** SHA-256 hash of the client secret (never store raw). */
  clientSecretHash: string;
  redirectUris: string[];
  isActive: boolean;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Identity / account
// ---------------------------------------------------------------------------

/**
 * A user account. Applications are expected to extend or map this onto their
 * own user model. Pezhwan treats `email`/`phone` as unique identity handles
 * and `passwordHash` (Argon2id) as the primary credential.
 */
export interface User {
  id: string;
  tenantId: string;
  email?: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  /** Incremented to invalidate every outstanding access token for the user. */
  tokenVersion: number;
  /** Argon2id hash (never plaintext). */
  passwordHash: string | null;
  /** OAuth/passkey identities linked to this account. */
  identities?: LinkedIdentity[];
  failedLoginAttempts: number;
  loginLockUntil: Date | null;
  mfaEnabled: boolean;
  mfaSecret?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A secondary identity linked to a user (OAuth provider, passkey, etc.). */
export interface LinkedIdentity {
  id: string;
  provider: string; // e.g. 'google' | 'apple' | 'github' | 'microsoft' | 'passkey' | 'webauthn'
  subject: string; // provider's unique subject identifier
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Authorization (RBAC + ABAC)
// ---------------------------------------------------------------------------

/** A resource-action pair (e.g. `ride:create`). */
export interface Permission {
  id: string;
  tenantId: string;
  applicationId: string;
  name: string; // "{resource}:{action}" e.g. "ride:create"
  resource: string;
  action: string;
  description?: string;
}

/** A named collection of permissions, scoped to a tenant + application. */
export interface Role {
  id: string;
  tenantId: string;
  applicationId: string;
  name: string; // e.g. 'ADMIN' | 'CAPTAIN' | 'RIDER'
  description?: string;
  permissionIds: string[];
  isSystem?: boolean;
}

/** Role assignment on a user within a tenant + application. */
export interface UserRoleAssignment {
  id: string;
  userId: string;
  tenantId: string;
  applicationId: string;
  roleId: string;
  assignedAt: Date;
}

// ---------------------------------------------------------------------------
// Sessions & tokens
// ---------------------------------------------------------------------------

/** A device/session tracked for the user. */
export interface Device {
  id: string;
  ip: string;
  userAgent: string;
  deviceLabel: string; // e.g. "Chrome on Windows"
}

/** An authenticated session with a rotating refresh-token family. */
export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  applicationId: string;
  status: SessionStatus;
  familyId: string;
  currentRefreshTokenHash: string;
  replacedBySessionId?: string;
  device?: Device;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

/** Standard metadata attached to a signed access token. */
export interface TokenClaims {
  sub: string; // user id
  tenantId: string;
  applicationId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  authMethod: AuthMethod;
  /** Key ID of the signing key, for rotation. */
  kid: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
  /** The tokenVersion the account had when the token was minted. */
  tokenVersion?: number;
  /** OAuth scopes granted to a client (service/API-key flows). */
  scope?: string;
  /** Whether the access token was issued via an OAuth client (non-interactive). */
  clientId?: string;
}

// ---------------------------------------------------------------------------
// OAuth 2.1 / OpenID Connect
// ---------------------------------------------------------------------------

/** Grants supported by the OAuth/OIDC authorization server. */
export type OAuthGrant =
  | 'authorization_code'
  | 'refresh_token'
  | 'client_credentials';

/** Response modes / flows Pezhwan implements. */
export type OAuthResponseType = 'code';

/** A registered OAuth client (public or confidential). */
export interface OAuthClient {
  id: string;
  tenantId: string;
  applicationId: string;
  name: string;
  clientId: string;
  /** SHA-256 hash of the client secret (never raw). Null for public clients. */
  clientSecretHash: string | null;
  /** Allowed redirect URIs (exact match). */
  redirectUris: string[];
  /** Allowed grant types. */
  grants: OAuthGrant[];
  /** Allowed PKCE methods (S256 required for public clients in OAuth 2.1). */
  pkceMethods: ('S256' | 'plain' | 'none')[];
  /** Allowed scopes (e.g. openid profile email). */
  scopes: string[];
  grantTypes?: string[];
  isActive: boolean;
  isConfidential: boolean;
  tokenEndpointAuthMethod: 'client_secret_basic' | 'client_secret_post' | 'none';
  createdAt: Date;
}

/** A one-time authorization code (short TTL, single use). */
export interface AuthorizationCode {
  id: string;
  codeHash: string; // SHA-256 of the raw code
  tenantId: string;
  applicationId: string;
  clientId: string;
  userId: string;
  sessionId: string;
  redirectUri: string;
  scope: string[];
  /**
   * SHA-256 of the PKCE code_verifier. We store the verifier challenge, not
   * the verifier itself, and compare in constant time.
   */
  codeChallenge: string | null;
  codeChallengeMethod: 'S256' | 'plain' | null;
  nonce: string | null;
  authMethod: AuthMethod;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// MFA / backup codes
// ---------------------------------------------------------------------------

/** Round-trippable MFA settings stored on the user (secret is select:false). */
export interface MfaSettings {
  enabled: boolean;
  /** Time of the most recent successful MFA challenge (for step-up). */
  lastVerifiedAt?: number | null;
}

// ---------------------------------------------------------------------------
// Verification / magic-link / password-reset tokens
// ---------------------------------------------------------------------------

export type VerificationTokenKind =
  | 'email_verification'
  | 'password_reset'
  | 'magic_link'
  | 'email_change'
  | 'phone_change';

/** A short-lived, single-use token bound to a user + tenant + application. */
export interface VerificationToken {
  id: string;
  kind: VerificationTokenKind;
  tenantId: string;
  applicationId: string;
  userId: string;
  /** SHA-256 of the raw token (never stored in plaintext). */
  tokenHash: string;
  /** Optional target (email/phone) the token verifies. */
  target?: string;
  /** Redirect target carried through a magic-link flow. */
  redirectUri?: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Identity context (attached to req.pezhwan after authentication)
// ---------------------------------------------------------------------------

/**
 * The verified identity context made available to applications after
 * successful authentication. NEVER derive roles/permissions from the client.
 */
export interface IdentityContext {
  userId: string;
  tenantId: string;
  applicationId: string;
  sessionId: string;
  roles: string[];
  permissions: string[];
  authMethod: AuthMethod;
  authenticatedAt: number; // epoch ms
  /** tokenVersion the account had when the access token was minted. */
  tokenVersion?: number;
  /** OAuth scope (service/API-key flows). */
  scope?: string;
  /** OAuth client that issued the token (service flows). */
  clientId?: string;
}

/** Request used for authorization decisions: identity + resource + action. */
export interface AuthorizationContext extends IdentityContext {
  resource?: string;
  action?: string;
  resourceId?: string;
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

/** Canonical security events Pezhwan records. */
export const AUDIT_EVENT = {
  USER_REGISTERED: 'USER_REGISTERED',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  PHONE_VERIFIED: 'PHONE_VERIFIED',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',
  MFA_CHALLENGE_FAILED: 'MFA_CHALLENGE_FAILED',
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  REFRESH_TOKEN_ROTATED: 'REFRESH_TOKEN_ROTATED',
  REFRESH_TOKEN_REUSE_DETECTED: 'REFRESH_TOKEN_REUSE_DETECTED',
  API_KEY_CREATED: 'API_KEY_CREATED',
  API_KEY_REVOKED: 'API_KEY_REVOKED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  PERMISSION_CHANGED: 'PERMISSION_CHANGED',
  OAUTH_LOGIN: 'OAUTH_LOGIN',
  OAUTH_CODE_EXCHANGED: 'OAUTH_CODE_EXCHANGED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED: 'ACCOUNT_UNLOCKED',
  RATE_LIMITED: 'RATE_LIMITED',
  CSRF_REJECTED: 'CSRF_REJECTED',
  ORIGIN_REJECTED: 'ORIGIN_REJECTED',
  AUTHZ_DENIED: 'AUTHZ_DENIED',
  BACKUP_CODES_GENERATED: 'BACKUP_CODES_GENERATED',
  BACKUP_CODE_USED: 'BACKUP_CODE_USED',
  MFA_CHALLENGE_SUCCESS: 'MFA_CHALLENGE_SUCCESS',
  OAUTH_AUTHORIZE: 'OAUTH_AUTHORIZE',
  OAUTH_TOKEN_ISSUED: 'OAUTH_TOKEN_ISSUED',
  OAUTH_PKCE_FAILED: 'OAUTH_PKCE_FAILED',
  OAUTH_REDIRECT_URI_MISMATCH: 'OAUTH_REDIRECT_URI_MISMATCH',
  OAUTH_CLIENT_AUTH_FAILED: 'OAUTH_CLIENT_AUTH_FAILED',
  MAGIC_LINK_SENT: 'MAGIC_LINK_SENT',
  MAGIC_LINK_VERIFIED: 'MAGIC_LINK_VERIFIED',
  VERIFICATION_TOKEN_ISSUED: 'VERIFICATION_TOKEN_ISSUED',
  VERIFICATION_TOKEN_USED: 'VERIFICATION_TOKEN_USED',
  API_KEY_AUTHENTICATED: 'API_KEY_AUTHENTICATED',
  SERVICE_AUTHENTICATED: 'SERVICE_AUTHENTICATED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  DOMAIN_ADDED: 'DOMAIN_ADDED',
  DOMAIN_REMOVED: 'DOMAIN_REMOVED',
} as const;

export type AuditEventType = (typeof AUDIT_EVENT)[keyof typeof AUDIT_EVENT];

/** A single tamper-resistant security audit record. */
export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  eventType: AuditEventType;
  severity: Severity;
  tenantId?: string;
  applicationId?: string;
  userId?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  metadata: Record<string, unknown>;
  /** Chain marker for tamper evidence (hash of previous record). */
  prevHash?: string;
}
