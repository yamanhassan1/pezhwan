import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import Layout from '../components/Layout/Layout';
import Login from './Login';
import Dashboard from './Dashboard';
import TenantsList from './Tenants/List';
import TenantsCreate from './Tenants/Create';
import UsersList from './Users/List';
import UsersCreate from './Users/Create';
import UsersDetails from './Users/Details';
import UsersEdit from './Users/Edit';
import RolesList from './Roles/List';
import ClientsList from './Clients/List';
import ClientsCreate from './Clients/Create';
import SessionsList from './Sessions/List';
import AuditLogs from './Audit/Logs';
import Breaches from './Security/Breaches';
import Risk from './Security/Risk';
import SubscriptionsList from './Subscriptions/List';
import Settings from './Settings/index';

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user, isAdmin } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <h2 style={{ marginBottom: 12 }}>403 - Access Denied</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>
            Your account does not have the ADMIN role required to use this console.
          </p>
          <a href="/login">Back to login</a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/users': 'Users',
  '/users/create': 'Create User',
  '/tenants': 'Tenants',
  '/tenants/create': 'Create Tenant',
  '/roles': 'Roles',
  '/clients': 'OAuth Clients',
  '/clients/create': 'Create OAuth Client',
  '/sessions': 'Sessions',
  '/audit': 'Audit Log',
  '/security/breaches': 'Security Breaches',
  '/security/risk': 'Risk Events',
  '/subscriptions': 'Subscriptions',
  '/settings': 'Settings',
};

function isKnownPath(pathname: string): boolean {
  return pathname.startsWith('/users/');
}

function Shell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] ?? (isKnownPath(pathname) ? 'PEZHWAN Admin' : 'Not Found');
  return <Layout title={title}>{children}</Layout>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Shell>
              <Dashboard />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/users"
        element={
          <RequireAuth>
            <Shell>
              <UsersList />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/users/create"
        element={
          <RequireAuth>
            <Shell>
              <UsersCreate />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/users/:id/edit"
        element={
          <RequireAuth>
            <Shell>
              <UsersEdit />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/users/:id"
        element={
          <RequireAuth>
            <Shell>
              <UsersDetails />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/tenants"
        element={
          <RequireAuth>
            <Shell>
              <TenantsList />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/tenants/create"
        element={
          <RequireAuth>
            <Shell>
              <TenantsCreate />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/roles"
        element={
          <RequireAuth>
            <Shell>
              <RolesList />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/clients"
        element={
          <RequireAuth>
            <Shell>
              <ClientsList />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/clients/create"
        element={
          <RequireAuth>
            <Shell>
              <ClientsCreate />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/sessions"
        element={
          <RequireAuth>
            <Shell>
              <SessionsList />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/audit"
        element={
          <RequireAuth>
            <Shell>
              <AuditLogs />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/security/breaches"
        element={
          <RequireAuth>
            <Shell>
              <Breaches />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/security/risk"
        element={
          <RequireAuth>
            <Shell>
              <Risk />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/subscriptions"
        element={
          <RequireAuth>
            <Shell>
              <SubscriptionsList />
            </Shell>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <Shell>
              <Settings />
            </Shell>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}