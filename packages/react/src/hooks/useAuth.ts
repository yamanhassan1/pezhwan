/**
 * PEZHWAN — auth hooks.
 *
 * Mirror of useAuth()/useAuthorization()/useSession() plus the standalone
 * MFA, passwordless, SSO, tenant and WebAuthn hooks.
 */

export { useAuth } from '../index.tsx';
export type { AuthState, AuthApi, PezhwanUser, PezhwanError } from '../index.tsx';