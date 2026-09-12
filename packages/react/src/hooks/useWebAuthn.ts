/**
 * PEZHWAN — WebAuthn / passkeys hook.
 *
 * Thin client for the passkey challenge endpoints:
 *   POST /v1/auth/webauthn/begin    → { options }  (publicKey credential request)
 *   POST /v1/auth/webauthn/complete → session       (assertion packed by the caller)
 */

import { useCallback } from 'react';
import { getActiveConfig, request } from '../index.tsx';

export interface WebAuthnBeginResult {
  options: unknown;
  requestId?: string;
}

export function useWebAuthn() {
  const begin = useCallback(async (): Promise<WebAuthnBeginResult> => {
    return (await request(getActiveConfig(), '/v1/auth/webauthn/begin', {
      method: 'POST',
    })) as WebAuthnBeginResult;
  }, []);

  const complete = useCallback(async (payload: unknown): Promise<unknown> => {
    return await request(getActiveConfig(), '/v1/auth/webauthn/complete', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }, []);

  return { begin, complete };
}