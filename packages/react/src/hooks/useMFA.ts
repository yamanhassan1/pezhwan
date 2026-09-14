/**
 * PEZHWAN — MFA hook.
 *
 * Talks to the plugin MFA router contract:
 *   POST /v1/mfa/setup   → { secret, otpauthUrl, backupCodes }
 *   POST /v1/mfa/enable  → { message }
 *   POST /v1/mfa/verify  → { verified }
 *   POST /v1/mfa/disable → { message }
 */

import { useCallback } from 'react';
import { getActiveConfig, request, type PezhwanUser } from '../index.tsx';

export interface MfaSetupResult {
  secret?: string;
  otpauthUrl?: string;
  backupCodes?: string[];
}

export interface MfaLoginResult {
  user?: PezhwanUser;
  accessToken?: string;
  refreshToken?: string;
}

export function useMFA() {
  const beginSetup = useCallback(async (): Promise<MfaSetupResult> => {
    return (await request(getActiveConfig(), '/v1/mfa/setup', {
      method: 'POST',
    })) as MfaSetupResult;
  }, []);

  const enable = useCallback(async (code: string): Promise<void> => {
    await request(getActiveConfig(), '/v1/mfa/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }, []);

  const verify = useCallback(async (code: string): Promise<{ verified: boolean }> => {
    return (await request(getActiveConfig(), '/v1/mfa/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })) as { verified: boolean };
  }, []);

  const completeMfaLogin = useCallback(
    async (userId: string, code: string): Promise<MfaLoginResult> => {
      return (await request(getActiveConfig(), '/v1/mfa/login', {
        method: 'POST',
        body: JSON.stringify({ userId, code }),
      })) as MfaLoginResult;
    },
    [],
  );

  const disable = useCallback(async (code: string): Promise<void> => {
    await request(getActiveConfig(), '/v1/mfa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }, []);

  return { beginSetup, enable, verify, completeMfaLogin, disable };
}
