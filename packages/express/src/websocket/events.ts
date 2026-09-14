/**
 * PEZHWAN — WebSocket event vocabulary.
 *
 * Event names the server can emit to connected clients, plus the on-wire
 * message envelope.
 */

export const PEZHWAN_WS_EVENTS = {
  sessionRejected: 'pezhwan.session.rejected',
  sessionRevoked: 'pezhwan.session.revoked',
  tokenRotated: 'pezhwan.token.rotated',
  policyUpdated: 'pezhwan.policy.updated',
  userUpdated: 'pezhwan.user.updated',
} as const;

export type PezhwanWsEventType = (typeof PEZHWAN_WS_EVENTS)[keyof typeof PEZHWAN_WS_EVENTS];

export interface WsEventMessage {
  type: string;
  /** Epoch millis when the event was produced. */
  ts: number;
  payload?: Record<string, unknown>;
}

export function wsEvent(type: string, payload?: Record<string, unknown>): WsEventMessage {
  return { type, ts: Date.now(), payload };
}
