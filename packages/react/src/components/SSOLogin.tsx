/**
 * PEZHWAN — SSOLogin.
 *
 * Redirects the browser to the runtime's OAuth authorization endpoint for the
 * chosen provider (google, apple, github, microsoft, linkedin, ...).
 */

import { useSSO } from '../hooks/useSSO.ts';

export function SSOLogin({
  provider = 'google',
  redirectUri,
  label,
}: {
  provider?: string;
  redirectUri?: string;
  label?: string;
}) {
  const { start } = useSSO();

  return (
    <button type="button" onClick={() => start(provider, redirectUri)}>
      {label ?? `Continue with ${provider}`}
    </button>
  );
}
