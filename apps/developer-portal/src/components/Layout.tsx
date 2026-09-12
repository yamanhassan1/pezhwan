import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard' },
  { to: '/api-keys', label: 'API Keys' },
  { to: '/webhooks', label: 'Webhooks' },
  { to: '/explorer', label: 'API Explorer' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/docs', label: 'Documentation' },
  { to: '/profile', label: 'Profile' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function closeNav() {
    setOpen(false);
  }

  const initial = (user?.email ?? 'U').slice(0, 1).toUpperCase();

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {open && <div onClick={closeNav} style={{ position: 'fixed', inset: 0, background: 'rgba(13,20,36,0.4)', zIndex: 40 }} />}
      <aside
        className={`sidebar-shell${open ? ' open' : ''}`}
        style={{
          width: 228,
          flexShrink: 0,
          background: 'linear-gradient(180deg, var(--sidebar-bg-2), var(--sidebar-bg))',
          borderRight: '1px solid var(--sidebar-border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'sticky',
          top: 0,
          height: '100vh',
          zIndex: 50,
        }}
      >
        <div style={{ padding: '20px 22px', borderBottom: '1px solid var(--sidebar-border)' }}>
          <Link to="/" onClick={closeNav} style={{ color: '#fff', textDecoration: 'none', display: 'block' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 19, fontWeight: 700, letterSpacing: '0.08em' }}>PEZHWAN</div>
            <div style={{ fontSize: 11.5, color: 'var(--sidebar-text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 2 }}>
              Developer Portal
            </div>
          </Link>
        </div>
        <nav style={{ padding: '14px 12px', flex: 1, overflowY: 'auto' }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={closeNav}
              className={({ isActive }) => (isActive ? 'dp-nav-link active' : 'dp-nav-link')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--sidebar-border)', fontSize: 12, color: 'var(--sidebar-text-muted)' }}>
          REST API v1
        </div>
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header
          style={{
            height: 60,
            background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 30,
          }}
          className="dp-header"
        >
          <button className="btn btn-secondary btn-sm dp-burger" onClick={() => setOpen((v) => !v)} aria-label="Toggle navigation">
            Menu
          </button>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }} className="dp-header-title">
            {NAV_ITEMS.find((i) => i.to === location.pathname)?.label ?? 'PEZHWAN'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {user?.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }} className="dp-user">
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: 'var(--primary-soft)',
                    color: 'var(--primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 13,
                  }}
                >
                  {initial}
                </span>
                <span style={{ fontSize: 13.5 }}>
                  <span style={{ fontWeight: 600 }} className="text-ellipsis">{user.email}</span>
                </span>
              </div>
            )}
            <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        <main style={{ flex: 1 }}>
          <Outlet />
        </main>

        <footer style={{ borderTop: '1px solid var(--border)', padding: '16px 32px', fontSize: 12.5, color: 'var(--text-muted)', background: 'var(--surface)' }}>
          PEZHWAN Developer Portal — v1 API. Access is admin-scoped.
        </footer>
      </div>
    </div>
  );
}