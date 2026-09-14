# @pezhwan/react

The React SDK for PEZHWAN — drop-in authentication and session management for
React applications. `<PezhwanProvider>` wraps your app, `useAuth()` gives you
the user and auth actions, and a set of ready-made components (login, register,
MFA, passkeys, SSO, session manager) covers the common UIs so you don't have to
build them from scratch.

## Installation

```bash
npm install @pezhwan/react
```

React is a peer dependency — make sure you have `react` and `react-dom`
installed in your project.

## Quick start

```tsx
import { PezhwanProvider, useAuth, ProtectedRoute } from '@pezhwan/react';

function App() {
  return (
    <PezhwanProvider config={{ baseUrl: 'https://api.example.com' }}>
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    </PezhwanProvider>
  );
}

function Dashboard() {
  const { user, logout, can } = useAuth();
  return (
    <>
      <p>Welcome, {user?.email}!</p>
      <button onClick={logout}>Sign out</button>
      {can('reports:read') && <Reports />}
    </>
  );
}
```

### Provider config

```ts
interface PezhwanConfig {
  baseUrl: string; // Required — the PEZHWAN API origin.
  cookieDomain?: string; // Cookie scope for cross-subdomain setups.
}
```

The provider restores the last session from `localStorage` (identity snapshot
only — never tokens), and refreshes it with a **silent refresh**: on a 401 it
rotates the httpOnly refresh cookie automatically, then re-fetches your
profile. A failed refresh that returns `SESSION_CONTEXT_INVALID` drops the
stale session rather than keeping an invalid cache.

## Hooks

### `useAuth()`

```ts
const {
  user, // PezhwanUser | null
  status, // 'loading' | 'guest' | 'authenticated'
  error, // string | PezhwanError | null
  login, // (input: { email?, phone?, password }) => Promise<void>
  register, // (input: { email?, phone?, password?, metadata? }) => Promise<void>
  logout, // () => Promise<void>
  refreshProfile, // () => Promise<void>
  can, // (permission: string) => boolean
  isAuthenticated, // boolean
  isLoading, // boolean
} = useAuth();
```

```tsx
const { login, status, error } = useAuth();

async function onSubmit(email: string, password: string) {
  try {
    await login({ email, password });
  } catch (err) {
    // err is a PezhwanError with { code, message, status }
  }
}
```

### `useSession()`

```ts
const { sessions, revokeSession, revokeAllSessions } = useSession();
```

### `useAuthorization()`

The `can(permission)` predicate — the UX-layer gate that mirrors what the
server enforces:

```ts
const can = useAuthorization();
{can('ride:create') && <CreateButton />}
```

> Frontend gates are a **UX layer only**. The server enforces every decision
> via `@pezhwan/express` middleware. `can()` currently passes any
> authenticated user with at least one role; wire it to your real permission
> logic before shipping anything security-sensitive.

### MFA, passwordless, SSO, WebAuthn, tenant

```ts
// TOTP MFA — manage enrolment and step-up
const mfa = useMFA();
await mfa.beginSetup(); // { secret?, otpauthUrl?, backupCodes? }
await mfa.enable(code); // confirm with the current TOTP
const { verified } = await mfa.verify(code); // step-up verification
const result = await mfa.completeMfaLogin(userId, code); // finish a challenged login
await mfa.disable(code); // requires a current code

// Passwordless / OTP login
const passwordless = usePasswordless();
await passwordless.send('email', 'ada@example.com'); // channel: 'email' | 'phone'
const result = await passwordless.login('email', 'ada@example.com', code);

// SSO / social login — build the authorize URL, then redirect
const sso = useSSO();
const url = sso.getAuthorizeUrl('google', 'https://app.example.com/cb');
sso.start('google', 'https://app.example.com/cb'); // window.location.assign(url)

// Passkeys / WebAuthn
const webauthn = useWebAuthn();
const { options } = await webauthn.begin();
// ... collect the authenticator assertion, then:
const session = await webauthn.complete({/* packed assertion */});

// Client-side tenant context (persisted in localStorage)
const tenant = useTenant();
tenant.tenantId();
tenant.setTenant('tenant-b');
tenant.clearTenant();
```

## Components

| Component           | Purpose                                                       | Props                                 |
| ------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `LoginForm`         | Email/phone + password sign-in.                               | —                                     |
| `RegisterForm`      | Self-service registration.                                    | —                                     |
| `MFALogin`          | Complete an MFA-challenged login.                             | `{ userId, onSuccess? }`              |
| `MFASetup`          | Enrol TOTP (shows secret + QR, collects the confirming code). | `{ onEnabled? }`                      |
| `PasswordlessLogin` | Email/phone OTP sign-in.                                      | `{ onSuccess? }`                      |
| `SSOLogin`          | Provider button + redirect.                                   | `{ provider?, redirectUri?, label? }` |
| `SessionManager`    | List active sessions, revoke one, revoke all.                 | —                                     |
| `TrustedDevices`    | Manage trusted devices.                                       | —                                     |
| `WebAuthnLogin`     | Passkey sign-in.                                              | —                                     |
| `Profile`           | Show the current user profile.                                | —                                     |
| `DataExport`        | Request a data export (GDPR).                                 | `{ filename? }`                       |
| `ProtectedRoute`    | Redirect guests to `fallbackPath`.                            | `{ fallbackPath? }`                   |
| `RequireRole`       | Render `children` only for a role.                            | `{ role, fallback? }`                 |
| `RequirePermission` | Render `children` only for an allowed identity.               | `{ permission, fallback? }`           |

`AuthProvider` is exported as an alias of `PezhwanProvider`.

## Errors

`PezhwanApiError` is thrown on any non-2xx response and carries the server
envelope's `code` and `status`:

```ts
import { PezhwanApiError, type PezhwanError } from '@pezhwan/react';

try {
  await useAuth().login({ email, password });
} catch (err) {
  if (err instanceof PezhwanApiError) {
    console.error(err.code, err.status, err.message); // e.g. ACCOUNT_LOCKED, 403
  }
}
```

CSRF is handled for you: state-changing requests automatically echo the
`pezhwan_csrf` cookie as `X-CSRF-Token`. Requests use `credentials: 'include'`
so the httpOnly session cookies flow with every call.

## Related docs

- [`docs/developer/GETTING-STARTED.md`](../../docs/developer/GETTING-STARTED.md) — boot the server and your first registration.
- [`@pezhwan/express`](../express/README.md) — the server-side middleware that grants/auths these browsers.
- [`@pezhwan/angular`](../angular/README.md) and [`@pezhwan/vue`](../vue/README.md) — the same SDK surface for other frameworks.
