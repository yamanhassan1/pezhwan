/**
 * PEZHWAN — RegisterForm.
 *
 * Controlled registration form wired to useAuth().register().
 */

import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth.ts';

export function RegisterForm({ onSuccess }: { onSuccess?: () => void }) {
  const { register, isLoading, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [metadata] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ email, password, metadata });
      onSuccess?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label="Register">
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
        minLength={8}
        required
      />
      <button type="submit" disabled={isLoading || busy}>
        Create account
      </button>
      {error ? (
        <p role="alert" className="pezhwan-error">
          {String(error)}
        </p>
      ) : null}
    </form>
  );
}
