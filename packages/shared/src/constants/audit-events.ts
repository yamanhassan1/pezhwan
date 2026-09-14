/**
 * PEZHWAN — audit event catalog.
 *
 * Re-exports the canonical audit events (source of truth in `src/types.ts`)
 * and classifies every event with a default severity for the observability
 * and compliance layers.
 */

import type { Severity } from '../types.ts';

export { AUDIT_EVENT, type AuditEventType } from '../types.ts';

/** Default severity assigned to each audit event when writing audit records. */
export const AUDIT_EVENT_SEVERITY: Record<import('../types.ts').AuditEventType, Severity> = {
  USER_REGISTERED: 'info',
  LOGIN_SUCCESS: 'info',
  LOGIN_FAILED: 'warning',
  PASSWORD_CHANGED: 'warning',
  PASSWORD_RESET: 'warning',
  EMAIL_VERIFIED: 'info',
  PHONE_VERIFIED: 'info',
  MFA_ENABLED: 'warning',
  MFA_DISABLED: 'warning',
  MFA_CHALLENGE_FAILED: 'warning',
  SESSION_CREATED: 'info',
  SESSION_REVOKED: 'info',
  SESSION_EXPIRED: 'info',
  REFRESH_TOKEN_ROTATED: 'info',
  REFRESH_TOKEN_REUSE_DETECTED: 'critical',
  API_KEY_CREATED: 'warning',
  API_KEY_REVOKED: 'warning',
  ROLE_CHANGED: 'warning',
  PERMISSION_CHANGED: 'warning',
  OAUTH_LOGIN: 'info',
  OAUTH_CODE_EXCHANGED: 'info',
  ACCOUNT_LOCKED: 'warning',
  ACCOUNT_UNLOCKED: 'warning',
  RATE_LIMITED: 'info',
  CSRF_REJECTED: 'warning',
  ORIGIN_REJECTED: 'warning',
  AUTHZ_DENIED: 'warning',
  BACKUP_CODES_GENERATED: 'warning',
  BACKUP_CODE_USED: 'info',
  MFA_CHALLENGE_SUCCESS: 'info',
  OAUTH_AUTHORIZE: 'info',
  OAUTH_TOKEN_ISSUED: 'info',
  OAUTH_PKCE_FAILED: 'warning',
  OAUTH_REDIRECT_URI_MISMATCH: 'warning',
  OAUTH_CLIENT_AUTH_FAILED: 'warning',
  MAGIC_LINK_SENT: 'info',
  MAGIC_LINK_VERIFIED: 'info',
  VERIFICATION_TOKEN_ISSUED: 'info',
  VERIFICATION_TOKEN_USED: 'info',
  API_KEY_AUTHENTICATED: 'info',
  SERVICE_AUTHENTICATED: 'info',
  PASSWORD_CHANGE_REQUIRED: 'warning',
  DOMAIN_ADDED: 'warning',
  DOMAIN_REMOVED: 'warning',
};
