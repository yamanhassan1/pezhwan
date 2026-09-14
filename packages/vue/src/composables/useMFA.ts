/**
 * PEZHWAN — Vue 3 MFA composable.
 *
 * TOTP enrolment + verification against the plugin MFA router contract
 * (/v1/mfa/setup /enable /verify /login /disable).
 */

import { getActiveConfig } from '../plugin';
import { request, type PezhwanUser } from './useAuth';

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
  return {
    async beginSetup(): Promise<MfaSetupResult> {
      return (await request(getActiveConfig(), '/v1/mfa/setup', {
        method: 'POST',
      })) as MfaSetupResult;
    },
    async enable(code: string): Promise<void> {
      await request(getActiveConfig(), '/v1/mfa/enable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
    },
    async verify(code: string): Promise<{ verified: boolean }> {
      return (await request(getActiveConfig(), '/v1/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ code }),
      })) as { verified: boolean };
    },
    async completeMfaLogin(userId: string, code: string): Promise<MfaLoginResult> {
      return (await request(getActiveConfig(), '/v1/mfa/login', {
        method: 'POST',
        body: JSON.stringify({ userId, code }),
      })) as MfaLoginResult;
    },
    async disable(code: string): Promise<void> {
      await request(getActiveConfig(), '/v1/mfa/disable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
    },
  };
}
