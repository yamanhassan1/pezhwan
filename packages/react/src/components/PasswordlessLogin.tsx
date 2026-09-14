/**
 * PEZHWAN — PasswordlessLogin.
 *
 * Email-based one-time-code sign in: request the code, then exchange it for a
 * session.
 */

import { useState, type FormEvent } from 'react';
import { usePasswordless } from '../hooks/usePasswordless.ts';

export function PasswordlessLogin({ onSuccess }: { onSuccess?: () => void }) {
  const { send, login } = usePasswordless();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'request' | 'code'>('request');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await send('email', email);
      setStage('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login('email', email, code);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'code') {
    return (
      <form onSubmit={submitCode} aria-label="Verify code">
        <input
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="One-time code"
          required
        />
        <button type="submit" disabled={busy}>
          Sign in
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    );
  }

  return (
    <form onSubmit={requestCode} aria-label="Passwordless login">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <button type="submit" disabled={busy}>
        Send code
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
