/**
 * PEZHWAN — passwordless (OTP) hook.
 *
 * Talks to the auth router OTP contract:
 *   POST /v1/auth/otp/send   → send a one-time code for a login
 *   POST /v1/auth/otp/login  → exchange the code for a session
 */

import { useCallback } from 'react';
import { getActiveConfig, request, type PezhwanUser } from '../index.tsx';

export type OtpChannel = 'email' | 'phone';

export interface PasswordlessLoginResult {
  user?: PezhwanUser;
  accessToken?: string;
  refreshToken?: string;
  mfaRequired?: boolean;
}

export function usePasswordless() {
  const send = useCallback(
    async (channel: OtpChannel, target: string): Promise<{ verified?: boolean; expiresIn?: number }> => {
      return (await request(getActiveConfig(), '/v1/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ channel, target, purpose: 'login' }),
      })) as { verified?: boolean; expiresIn?: number };
    },
    [],
  );

  const login = useCallback(
    async (channel: OtpChannel, target: string, code: string): Promise<PasswordlessLoginResult> => {
      return (await request(getActiveConfig(), '/v1/auth/otp/login', {
        method: 'POST',
        body: JSON.stringify({ channel, target, code }),
      })) as PasswordlessLoginResult;
    },
    [],
  );

  return { send, login };
}