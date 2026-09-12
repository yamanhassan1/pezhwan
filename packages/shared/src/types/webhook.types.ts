/**
 * PEZHWAN — webhook delivery types.
 */

/** An event dispatched to an external endpoint. */
export interface WebhookEvent {
  id: string;
  type: string;
  tenantId?: string;
  applicationId?: string;
  payload: unknown;
  timestamp: Date;
}

/** A registered webhook endpoint. */
export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  secretHash: string;
  events: string[];
  enabled: boolean;
  createdAt: Date;
}

/** A single delivery attempt result. */
export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventId: string;
  status: 'queued' | 'delivered' | 'failed';
  attempts: number;
  nextRetryAt?: Date;
  lastError?: string;
  deliveredAt?: Date;
}

/** Webhook signature result/requirement. */
export interface WebhookSignature {
  /** HMAC-SHA256 signature (hex). */
  signature: string;
  /** Signature timestamp sent in the `webhook-timestamp` header. */
  timestamp: number;
}
