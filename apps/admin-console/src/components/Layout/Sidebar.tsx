import { NavLink } from 'react-router-dom';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { section: 'Management' },
  { to: '/users', label: 'Users' },
  { to: '/tenants', label: 'Tenants' },
  { to: '/roles', label: 'Roles' },
  { to: '/clients', label: 'OAuth Clients' },
  { section: 'Operations' },
  { to: '/sessions', label: 'Sessions' },
  { to: '/audit', label: 'Audit Log' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { section: 'Security' },
  { to: '/security/breaches', label: 'Breaches' },
  { to: '/security/risk', label: 'Risk Events' },
  { section: 'System' },
  { to: '/settings', label: 'Settings' },
];

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">PEZHWAN Admin</div>
      <nav className="sidebar-nav">
        {NAV.map((item, i) => {
          if ('section' in item) {
            return (
              <div key={i} className="sidebar-section">
                {item.section}
              </div>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
