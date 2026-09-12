/**
 * PEZHWAN — Profile.
 *
 * Renders the authenticated user's identity fields and a logout action.
 */

import { useAuth } from '../hooks/useAuth.ts';

export function Profile() {
  const { user, logout, isLoading } = useAuth();

  if (isLoading || !user) {
    return null;
  }

  return (
    <section aria-label="Profile">
      <p className="pezhwan-user-email">{user.email ?? user.phone ?? user.id}</p>
      {user.roles && user.roles.length > 0 ? (
        <ul className="pezhwan-roles">
          {user.roles.map((role) => (
            <li key={role}>{role}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" onClick={() => void logout()}>
        Sign out
      </button>
    </section>
  );
}