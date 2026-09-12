/**
 * PEZHWAN — WebSocket handshake auth.
 *
 * The WebSocket upgrade is authenticated with the same access token used for
 * REST: either `?access_token=` on the upgrade URL or an `x-access-token` /
 * `Authorization: Bearer …` header. The token is verified locally via the
 * runtime KeyStore — no network round-trip.
 */

import type { IncomingMessage } from 'node:http';
import type { IdentityContext } from '@pezhwan/shared';
import type { PezhwanRuntime } from '@pezhwan/core';

export function extractWsAccessToken(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query = url.searchParams.get('access_token');
  if (query && query.length > 0) {
    return query;
  }
  const header = req.headers['x-access-token'] ?? req.headers.authorization;
  if (typeof header === 'string' && header.length > 0) {
    if (header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim() || null;
    }
    return header;
  }
  return null;
}

export function authenticateHandshake(
  runtime: PezhwanRuntime,
  req: IncomingMessage,
): IdentityContext | null {
  const token = extractWsAccessToken(req);
  if (!token) {
    return null;
  }
  try {
    return runtime.tokens.verifyAccessToken(token);
  } catch {
    return null;
  }
}