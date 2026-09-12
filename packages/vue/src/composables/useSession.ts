/**
 * PEZHWAN — Vue 3 session composable.
 *
 * Reactive list of the authenticated user's active sessions with single /
 * bulk revocation (/v1/sessions, /v1/sessions/:id/revoke, /v1/sessions/all/revoke).
 */

import { readonly, ref, type Ref } from 'vue';
import { getActiveConfig } from '../plugin';
import { request } from './useAuth';

export interface PezhwanSession {
  _id?: string;
  device?: string;
  ip?: string;
  userAgent?: string;
  createdAt?: string;
  lastActiveAt?: string;
  [key: string]: unknown;
}

const sessions = ref<PezhwanSession[]>([]) as Ref<PezhwanSession[]>;

export async function loadSessions(): Promise<void> {
  const data = (await request(getActiveConfig(), '/v1/sessions')) as { sessions?: PezhwanSession[] };
  sessions.value = data.sessions ?? [];
}

export function useSession() {
  return {
    sessions: readonly(sessions),
    async refresh(): Promise<void> {
      return loadSessions();
    },
    async revokeSession(sessionId: string): Promise<void> {
      await request(getActiveConfig(), `/v1/sessions/${sessionId}/revoke`, { method: 'POST' });
      sessions.value = sessions.value.filter((s) => String(s._id) !== sessionId);
    },
    async revokeAllSessions(): Promise<void> {
      await request(getActiveConfig(), '/v1/sessions/all/revoke', { method: 'POST' });
      sessions.value = [];
    },
  };
}