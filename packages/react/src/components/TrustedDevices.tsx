/**
 * PEZHWAN — TrustedDevices.
 *
 * Derived from the active-session list: each session is presented as a device
 * (best-effort `device` / IP / user-agent label) that can be revoked.
 */

import { useSession } from '../hooks/useSession.ts';

function deviceLabel(session: Record<string, unknown>): string {
  if (typeof session.device === 'string' && session.device.length > 0) return session.device;
  if (typeof session.userAgent === 'string' && session.userAgent.length > 0) {
    return session.userAgent;
  }
  if (typeof session.ip === 'string' && session.ip.length > 0) return session.ip;
  return 'Unknown device';
}

export function TrustedDevices() {
  const { sessions, revokeSession } = useSession();

  return (
    <ul className="pezhwan-devices" aria-label="Trusted devices">
      {sessions.map((session) => {
        const record = (session ?? {}) as Record<string, unknown>;
        const id = String(record._id ?? '');
        return (
          <li key={id}>
            <span>{deviceLabel(record)}</span>
            <button type="button" onClick={() => void revokeSession(id)}>
              Remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}
