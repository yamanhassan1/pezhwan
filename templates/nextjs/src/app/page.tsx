import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <h1>Pezhwan Next.js</h1>
      <p>Next.js App Router starter wired into the PEZHWAN identity platform.</p>
      <ul>
        <li>
          <Link href="/login">Sign in</Link>
        </li>
        <li>
          <Link href="/dashboard">Dashboard</Link>
        </li>
        <li>
          <Link href="/profile">Profile</Link>
        </li>
      </ul>
    </main>
  );
}
