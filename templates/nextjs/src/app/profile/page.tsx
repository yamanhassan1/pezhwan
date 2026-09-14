'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@pezhwan/react';

function ProfileContent() {
  const { user, logout, refreshProfile } = useAuth();

  return (
    <main>
      <h1>Profile</h1>
      <dl>
        <dt>ID</dt>
        <dd>{user?.id}</dd>
        <dt>Email</dt>
        <dd>{user?.email}</dd>
        <dt>Roles</dt>
        <dd>{user?.roles?.join(', ') ?? '—'}</dd>
      </dl>
      <button type="button" onClick={() => void refreshProfile()}>
        Refresh profile
      </button>
      <button type="button" onClick={() => void logout()}>
        Sign out
      </button>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute fallbackPath="/login">
      <ProfileContent />
    </ProtectedRoute>
  );
}
