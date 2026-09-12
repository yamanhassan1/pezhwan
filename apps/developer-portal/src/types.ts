export interface ApiEnvelope<T = unknown> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

export interface User {
  id: string;
  tenantId: string;
  applicationId: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  isActive: boolean;
  roles: string[];
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResponse {
  mfaRequired: boolean;
  user?: User;
  tokens: Tokens;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey;
  rawKey: string;
  prefix: string;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  maxRetries: number;
  createdAt: string;
  secret?: string;
}

export interface WebhookTestResult {
  delivered: boolean;
  url: string;
}

export interface AdminStats {
  users: number;
  tenants: number;
  activeSessions: number;
  apiKeys: number;
  oauthClients: number;
  webhooks: number;
  signups24h: number;
  failedLogins24h: number;
  auditToday: number;
  breaches: number;
  riskEvents: number;
  risk: RiskEvent[];
}

export interface RiskEvent {
  score: number;
  action: string;
  attemptId: string;
  ip?: string;
  country?: string;
  signals?: string[];
  createdAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  eventType: string;
  severity: string;
  userId: string;
  ip: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  sequence: number;
  hash: string;
  prevHash: string;
}

export interface AuditLogsResponse {
  auditLogs: AuditLog[];
  total: number;
}

export interface Session {
  id: string;
  userId: string;
  applicationId: string;
  status: string;
  device: Record<string, unknown>;
  lastActiveAt: string;
}

export interface SessionsResponse {
  sessions: Session[];
  total: number;
}

export const AUDIT_EVENTS = [
  'USER_REGISTERED',
  'LOGIN_SUCCESS',
  'LOGIN_FAILED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'EMAIL_VERIFIED',
  'PHONE_VERIFIED',
  'MFA_ENABLED',
  'MFA_DISABLED',
  'MFA_CHALLENGE_FAILED',
  'SESSION_CREATED',
  'SESSION_REVOKED',
  'SESSION_EXPIRED',
  'REFRESH_TOKEN_ROTATED',
  'REFRESH_TOKEN_REUSE_DETECTED',
  'API_KEY_CREATED',
  'API_KEY_REVOKED',
  'ROLE_CHANGED',
  'PERMISSION_CHANGED',
  'OAUTH_LOGIN',
  'OAUTH_CODE_EXCHANGED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'RATE_LIMITED',
  'CSRF_REJECTED',
  'ORIGIN_REJECTED',
  'AUTHZ_DENIED',
  'BACKUP_CODES_GENERATED',
  'BACKUP_CODE_USED',
  'MFA_CHALLENGE_SUCCESS',
  'OAUTH_AUTHORIZE',
  'OAUTH_TOKEN_ISSUED',
  'OAUTH_PKCE_FAILED',
  'OAUTH_REDIRECT_URI_MISMATCH',
  'OAUTH_CLIENT_AUTH_FAILED',
  'MAGIC_LINK_SENT',
  'MAGIC_LINK_VERIFIED',
  'VERIFICATION_TOKEN_ISSUED',
  'VERIFICATION_TOKEN_USED',
  'API_KEY_AUTHENTICATED',
  'SERVICE_AUTHENTICATED',
  'PASSWORD_CHANGE_REQUIRED',
  'DOMAIN_ADDED',
  'DOMAIN_REMOVED',
] as const;

export type AuditEventName = (typeof AUDIT_EVENTS)[number];
