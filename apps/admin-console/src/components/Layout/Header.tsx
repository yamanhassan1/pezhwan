import { useAuth } from '../../hooks/useAuth';

export default function Header({ title }: { title: string }) {
  const { user, logout } = useAuth();
  return (
    <header className="header">
      <div className="header-title">{title}</div>
      <div className="header-right">
        <span className="header-email">{user?.email ?? '---'}</span>
        <button className="btn btn-ghost btn-sm" onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}
