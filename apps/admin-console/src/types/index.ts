export interface Envelope<T = unknown> {
  success: boolean;
  data: T;
  error?: { code: string; message: string; detail?: unknown };
}

export interface ApiError {
  code: string;
  message: string;
  detail?: unknown;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  plan: string;
  status: string;
  config: Record<string, unknown>;
  createdAt: string | null;
}

export interface User {
  id: string;
  tenantId: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  isActive: boolean;
  mfaEnabled: boolean;
  lockedUntil: string | null;
  roles: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  permissionIds: string[];
  isSystem: boolean;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string | null;
}

export interface Client {
  clientId: string;
  tenantId: string;
  applicationId: string;
  name: string;
  redirectUris: string[];
  grants: string[];
  scopes: string[];
  isActive: boolean;
  isConfidential: boolean;
  createdAt: string | null;
}

export interface Session {
  id: string;
  userId: string;
  tenantId: string;
  applicationId: string;
  status: string;
  device: { ip?: string; userAgent?: string; deviceLabel?: string } | null;
  lastActiveAt: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface AuditEntry {
  id: string;
  timestamp: string | null;
  eventType: string;
  severity: string;
  tenantId: string | null;
  applicationId: string | null;
  userId: string | null;
  sessionId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  sequence: number | null;
  hash: string | null;
  prevHash: string | null;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string | null;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string | null;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  maxRetries: number;
  createdAt: string | null;
  secret?: string;
}

export interface Stats {
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
  risk: Record<string, unknown>[];
}

export interface SubChange {
  tenantId: string;
  tenant: string;
  plan: string;
  status: string;
  cancelAtPeriodEnd: boolean;
}

export interface CurrentUser {
  id: string;
  tenantId: string;
  applicationId: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  isActive: boolean;
  roles: string[];
}
