import { Navigate, Outlet, Route, Routes, useLocation, Link } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Login from './routes/Login';
import Dashboard from './routes/Dashboard';
import ApiKeysList from './routes/ApiKeys/List';
import ApiKeysCreate from './routes/ApiKeys/Create';
import WebhooksList from './routes/Webhooks/List';
import WebhooksCreate from './routes/Webhooks/Create';
import ApiExplorer from './components/ApiExplorer';
import Analytics from './routes/Analytics';
import Docs from './routes/Docs';
import Profile from './routes/Profile';

function FullScreenLoader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg)',
      }}
    >
      <span className="loader" />
    </div>
  );
}

function Forbidden() {
  return (
    <div
      className="page"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}
    >
      <div className="card" style={{ maxWidth: 440, textAlign: 'center' }}>
        <h2 className="mb-2">403 Forbidden</h2>
        <p className="muted mb-3">
          Your account does not have the ADMIN role required to access this area of the developer
          portal.
        </p>
        <Link className="btn" to="/" style={{ textDecoration: 'none' }}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function RequireAuth({ roles }: { roles?: string[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.some((r) => user.roles.includes(r))) {
    return <Forbidden />;
  }

  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth roles={['ADMIN']} />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="/api-keys" element={<ApiKeysList />} />
          <Route path="/api-keys/create" element={<ApiKeysCreate />} />
          <Route path="/webhooks" element={<WebhooksList />} />
          <Route path="/webhooks/create" element={<WebhooksCreate />} />
          <Route path="/explorer" element={<ApiExplorer />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
