# @pezhwan/react

React SDK for PEZHWAN — `PezzhwanProvider`, `useAuth()`, `useSession()`,
`useAuthorization()`, route guards and a set of ready-made auth components.

## Install

```bash
npm install @pezhwan/react @pezhwan/shared
```

## Quick start

```tsx
import { PezhwanProvider, useAuth, ProtectedRoute } from '@pezhwan/react';

function App() {
  return (
    <PezzhwanProvider config={{ baseUrl: 'https://api.example.com' }}>
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    </PezzhwanProvider>
  );
}
```

## Hooks

- `useAuth()` — `{ user, status, error, login, register, logout, refreshProfile, can, isAuthenticated, isLoading }`
- `useSession()` — sessions list + `revokeSession` / `revokeAllSessions`
- `useAuthorization()` — the `can(permission)` predicate (UX layer only)
- `useMFA()` — TOTP setup/enable/verify/disable + MFA-challenged login
- `usePasswordless()` — email/phone OTP send + login
- `useSSO()` — build an OAuth authorize URL and redirect
- `useTenant()` — client-side tenant context
- `useWebAuthn()` — passkey challenge begin/complete

## Components

`LoginForm`, `RegisterForm`, `MFALogin`, `MFASetup`, `PasswordlessLogin`,
`Profile`, `SSOLogin`, `SessionManager`, `TrustedDevices`, `WebAuthnLogin`,
`DataExport`, `ProtectedRoute`, `RequireRole`, `RequirePermission`.

Frontend gates are a UX layer — the server enforces every decision via
`@pezhwan/express` middleware.