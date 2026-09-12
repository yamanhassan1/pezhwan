'use client';

import Link from 'next/link';
import { useAuth } from '@pezhwan/react';

export default function Navbar() {
  const { isAuthenticated, user } = useAuth();

  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/dashboard">Dashboard</Link>
      <Link href="/profile">Profile</Link>
      {!isAuthenticated && <Link href="/login">Login</Link>}
      {isAuthenticated && <span>{user?.email}</span>}
    </nav>
  );
}