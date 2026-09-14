import { Link } from 'react-router-dom';
import { useAuth } from '@pezhwan/react';

export default function Nav() {
  const { isAuthenticated, user } = useAuth();

  return (
    <nav>
      <Link to="/">Home</Link>
      <Link to="/profile">Profile</Link>
      {isAuthenticated ? (
        <span>{user?.email}</span>
      ) : (
        <>
          <Link to="/login">Login</Link>
          <Link to="/register">Register</Link>
        </>
      )}
    </nav>
  );
}
