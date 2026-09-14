/**
 * PEZHWAN — MFASetup.
 *
 * Runs the TOTP enrolment flow: request a setup secret, render the otpauth
 * URI / backup codes, then confirm with a code from the authenticator app.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useMFA } from '../hooks/useMFA.ts';

export function MFASetup({ onEnabled }: { onEnabled?: () => void }) {
  const { beginSetup, enable } = useMFA();
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    beginSetup()
      .then((result) => {
        if (!mounted) return;
        setOtpauthUrl(result.otpauthUrl ?? null);
        setBackupCodes(result.backupCodes ?? []);
      })
      .catch((err: unknown) => {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
    };
  }, [beginSetup]);

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await enable(code);
      onEnabled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Set up two-factor authentication">
      {otpauthUrl ? (
        <p>
          <code className="pezhwan-otpauth">{otpauthUrl}</code>
        </p>
      ) : null}
      {backupCodes.length > 0 ? (
        <ul className="pezhwan-backup-codes">
          {backupCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={confirm}>
        <input
          inputMode="numeric"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Confirmation code"
          required
        />
        <button type="submit" disabled={busy || !otpauthUrl}>
          Enable
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
