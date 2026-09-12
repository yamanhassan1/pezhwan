/**
 * PEZHWAN — MFALogin.
 *
 * Collects a TOTP/backup code during an MFA-challenged login or step-up
 * gate and calls the MFA login endpoint.
 */

import { useState, type FormEvent } from 'react';
import { useMFA } from '../hooks/useMFA.ts';

export function MFALogin({
  userId,
  onSuccess,
}: {
  userId: string;
  onSuccess?: () => void;
}) {
  const { completeMfaLogin } = useMFA();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await completeMfaLogin(userId, code);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-label="Two-factor code">
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Verification code"
        required
      />
      <button type="submit" disabled={busy}>
        Verify
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}