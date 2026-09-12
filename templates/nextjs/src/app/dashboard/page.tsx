'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@pezhwan/react';

function DashboardContent() {
  const { user, isAuthenticated } = useAuth();

  return (
    <main>
      <h1>Dashboard</h1>
      <p>{isAuthenticated ? `Welcome, ${user?.email ?? 'user'}` : 'Loading…'}</p>
      <dl>
        <dt>ID</dt>
        <dd>{user?.id}</dd>
        <dt>Roles</dt>
        <dd>{user?.roles?.join(', ') ?? '—'}</dd>
      </dl>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute fallbackPath="/login">
      <DashboardContent />
    </ProtectedRoute>
  );
}