import { Link } from 'react-router-dom';
import { useAuth } from '@pezhwan/react';

export default function Home() {
  const { isAuthenticated, user } = useAuth();

  return (
    <main>
      <h1>Pezhwan React SPA</h1>
      <p>{isAuthenticated ? `Signed in as ${user?.email ?? 'unknown user'}` : 'Not signed in'}</p>
      <nav>
        <Link to="/profile">Profile</Link>
        <Link to="/login">Login</Link>
        <Link to="/register">Register</Link>
      </nav>
    </main>
  );
}
