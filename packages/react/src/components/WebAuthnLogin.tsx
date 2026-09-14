/**
 * PEZHWAN — WebAuthnLogin.
 *
 * Passkey login convenience: requests a WebAuthn challenge and surfaces the
 * opaque `options` for the caller to drive `navigator.credentials` with;
 * the resulting assertion is passed back to `complete()`.
 */

import { useState } from 'react';
import { useWebAuthn } from '../hooks/useWebAuthn.ts';

export function WebAuthnLogin() {
  const { begin, complete } = useWebAuthn();
  const [options, setOptions] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await begin();
      setOptions(result.options);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitAssertion = async (assertion: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await complete(assertion);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (options !== null) {
    return (
      <section aria-label="Passkey login">
        <p>Passkey challenge received. Sign the assertion and submit.</p>
        <button type="button" disabled={busy} onClick={() => void submitAssertion(options)}>
          Submit assertion
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </section>
    );
  }

  return (
    <section aria-label="Passkey login">
      <button type="button" disabled={busy} onClick={() => void start()}>
        Sign in with passkey
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
