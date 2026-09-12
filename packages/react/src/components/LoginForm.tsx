/**
 * PEZHWAN — LoginForm.
 *
 * Controlled email/password login form wired to useAuth().login().
 */

import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth.ts';

export function LoginForm({ onSuccess }: { onSuccess?: () => void }) {
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login({ email, password });
      onSuccess?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label="Login">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      <button type="submit" disabled={isLoading || busy}>
        Sign in
      </button>
      {error ? (
        <p role="alert" className="pezhwan-error">
          {String(error)}
        </p>
      ) : null}
    </form>
  );
}