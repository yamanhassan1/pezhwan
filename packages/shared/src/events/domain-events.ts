/**
 * PEZHWAN — internal domain events published on the event bus / outbox.
 */

/** Canonical domain event names. */
export const DOMAIN_EVENT = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  PASSWORD_CHANGED: 'user.password_changed',
  SESSION_CREATED: 'session.created',
  SESSION_REVOKED: 'session.revoked',
  OTP_REQUESTED: 'otp.requested',
  OTP_VERIFIED: 'otp.verified',
  OAUTH_CODE_ISSUED: 'oauth.code_issued',
  WEBHOOK_QUEUED: 'webhook.queued',
  API_KEY_CREATED: 'api_key.created',
  API_KEY_REVOKED: 'api_key.revoked',
  TENANT_CREATED: 'tenant.created',
  APPLICATION_CREATED: 'application.created',
} as const;

export type DomainEventName = (typeof DOMAIN_EVENT)[keyof typeof DOMAIN_EVENT];

/** A domain event published to subscribers (event bus / outbox / webhooks). */
export interface DomainEvent<T = unknown> {
  id: string;
  name: DomainEventName | (string & {});
  tenantId?: string;
  applicationId?: string;
  userId?: string;
  occurredAt: Date;
  payload: T;
  /** Correlation id propagated across processors. */
  correlationId?: string;
}

/** Builds a domain event with a stable shape and a generated id. */
export function createDomainEvent<T>(
  name: DomainEventName | (string & {}),
  payload: T,
  options: {
    id?: string;
    tenantId?: string;
    applicationId?: string;
    userId?: string;
    correlationId?: string;
  } = {},
): DomainEvent<T> {
  return {
    id: options.id ?? globalThis.crypto.randomUUID(),
    name,
    occurredAt: new Date(),
    payload,
    tenantId: options.tenantId,
    applicationId: options.applicationId,
    userId: options.userId,
    correlationId: options.correlationId,
  };
}
