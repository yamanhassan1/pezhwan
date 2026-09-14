/**
 * PEZHWAN — SessionManager.
 *
 * Lists the user's active sessions and offers single / all revocation.
 */

import { useSession } from '../hooks/useSession.ts';

export function SessionManager() {
  const { sessions, revokeSession, revokeAllSessions } = useSession();

  return (
    <section aria-label="Active sessions">
      <h2>Active sessions</h2>
      <ul className="pezhwan-sessions">
        {sessions.map((session) => {
          const id = String((session as { _id?: string })._id ?? '');
          return (
            <li key={id}>
              <span>{(session as { device?: string }).device ?? 'Unknown device'}</span>
              <button type="button" onClick={() => void revokeSession(id)}>
                Revoke
              </button>
            </li>
          );
        })}
      </ul>
      {sessions.length > 0 ? (
        <button type="button" onClick={() => void revokeAllSessions()}>
          Sign out everywhere
        </button>
      ) : (
        <p>No active sessions.</p>
      )}
    </section>
  );
}
