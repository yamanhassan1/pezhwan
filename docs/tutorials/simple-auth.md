# Simple authentication

This tutorial builds the minimal PEZHWAN integration: start the identity
server, register a user, log in, call a protected endpoint with the access
token, rotate tokens via refresh, and sign out — introducing the
`{ success, data, error }` response envelope and the CSRF double-submit cookie
that protects every state-changing request.

A complete runnable example lives in `demos/basic-auth/`.

## Prerequisites

- A working repo setup: `npm install`, `cp .env.example .env`, `npm run build`
  (see [`../developer/GETTING-STARTED.md`](../developer/GETTING-STARTED.md)).
- MongoDB running at `mongodb://localhost:27017` (Redis is optional).
- `curl` and a JSON pretty-printer, or HTTPie.

## 1. Start the identity server

The reference server validates all environment vars at startup via Zod
(`apps/identity-server/src/config/env.ts`), so make sure `PEZHWAN_ISSUER`,
`PEZHWAN_TENANT_ID` and `PEZHWAN_APPLICATION_ID` are set to the `.env.example`
values. Seed once, then start:

```bash
npm run seed
npm run dev -w @pezhwan/identity-server
```

Verify it is listening and healthy:

```bash
curl http://localhost:4011/health/live
curl http://localhost:4011/health/ready   # 200 when Mongo is connected
```

## 2. The response envelope

Every endpoint returns `{ success, data, error }`:

```json
{ "success": true, "data": { "message": "Logged out" } }
```

Errors have the same shape with `success: false`:

```json
{
  "success": false,
  "error": { "code": "INVALID_CREDENTIALS", "message": "Invalid email or password" }
}
```

The `error.code` is stable across SDKs — switch on it in client code. The
OAuth/OIDC endpoints are the one exception and use the RFC 6749 wire format
(see the [OAuth tutorial](./oauth-setup.md)).

## 3. Register a user

State-changing requests must echo the double-submit CSRF cookie. Fetch it once
(`GET /v1/auth/csrf` sets the `pezhwan_csrf` cookie and returns the token), then
send it as `X-CSRF-Token`:

```bash
curl -s -c cookies.txt http://localhost:4011/v1/auth/csrf
# {"success":true,"csrfToken":"<token>"}
CSRF="<token>"

curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"ada@example.com","password":"<pw>","metadata":{"plan":"demo"}}' \
  http://localhost:4011/v1/auth/register
```

A `201` returns tokens plus the user:

```json
{
  "success": true,
  "data": {
    "user": { "_id": "...", "email": "ada@example.com" },
    "accessToken": "<jwt>",
    "refreshToken": "<opaque>"
  }
}
```

`POST /v1/auth/register` accepts `email`, `phone`, `password` and `metadata`;
at least one of `email`/`phone` plus `password` is required. Login attempts are
rate-limited (`PEZHWAN_RATE_LIMIT_LOGIN`, default `10/15m`) and accounts are
locked after `PEZHWAN_LOCKOUT_MAX_ATTEMPTS` (default 5) failures.

## 4. Log in

```bash
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"ada@example.com","password":"<pw>"}' \
  http://localhost:4011/v1/auth/login
```

A successful login returns the same token pair as registration. The access
token is a short-lived JWT signed with the configured algorithm (default
`RS256`); the refresh token is an opaque, rotating credential tied to a server
session. If the account has MFA enabled the response is instead
`{ "mfaRequired": true, "userId": "..." }` — continue in the
[MFA tutorial](./mfa-setup.md).

## 5. Call a protected endpoint

Send the access token in the `Authorization` header. The profile endpoint
scopes its lookup to the identity's tenant:

```bash
curl -s -H "Authorization: Bearer $ACCESS" http://localhost:4011/v1/users/me
```

Protected routes are enforced with `createAuthenticate(runtime)` plus
`requireAuth()` in `packages/express/src/index.ts`. Without a token you get
`401 UNAUTHENTICATED`; a token whose account was disabled or `tokenVersion`
bumped (e.g. password change) is rejected. Your own routes use the same pair:

```ts
import { createAuthenticate, requireAuth } from '@pezhwan/express';

app.get('/account', createAuthenticate(runtime), requireAuth(), (req, res) => {
  res.json({ me: req.pezhwan }); // userId, tenantId, roles, permissions, sessionId
});
```

## 6. Refresh a token

Refresh tokens rotate: every use returns a brand-new pair and invalidates the
old one (reuse detection revokes the whole family). Send the current refresh
token to `POST /v1/auth/refresh`:

```bash
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d "{\"refreshToken\":\"$REFRESH\"}" \
  http://localhost:4011/v1/auth/refresh
# { "success": true, "data": { "accessToken": "<jwt>", "refreshToken": "<opaque>" } }
```

Cache the new pair immediately — the old one is dead. In production, deliver
these as `httpOnly` cookies at your gateway so browser code never touches them
(the reference server returns them in the body for development).

## 7. Log out

```bash
curl -s -b cookies.txt -X POST \
  -H "X-CSRF-Token: $CSRF" \
  -H "Authorization: Bearer $ACCESS" \
  http://localhost:4011/v1/auth/logout
```

This revokes the current session server-side. Sessions are visible and
revocable individually via `GET /v1/sessions`, `POST /v1/sessions/:id/revoke`
and `POST /v1/sessions/all/revoke`.

## Node.js SDK quick start

For server-side integrations, drive the runtime directly with `@pezhwan/node`
(mirrored in `demos/basic-auth/server.ts`):

```ts
import { Pezhwan } from '@pezhwan/node';

const pezhwan = Pezhwan({
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'http://localhost:4011',
  audience: 'pezhwan.clients',
  otpDelivery: { sendEmail: async (to, code) => console.log(`OTP to ${to}: ${code}`) },
});

await pezhwan.auth.register({ email: 'ada@example.com', password: '<pw>' });
const { tokens } = await pezhwan.auth.loginPassword({
  email: 'ada@example.com',
  password: '<pw>',
}); // tokens.accessToken, tokens.refreshToken
```

## React quick start

`@pezhwan/react` manages the bootstrap, silent refresh and session state for
you. Wrap your app in a provider, then read `useAuth()`:

```tsx
import { PezhwanProvider, ProtectedRoute, useAuth } from '@pezhwan/react';

function App() {
  return (
    <PezhwanProvider config={{ baseUrl: 'http://localhost:4011' }}>
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    </PezhwanProvider>
  );
}

function Dashboard() {
  const { user, login, logout } = useAuth();
  // login({ email, password }); logout();
  return <h1>Welcome {user?.email}</h1>;
}
```

`useAuth()` exposes `{ user, status, isAuthenticated, isLoading, login,
register, logout, refreshProfile, can }`. `ProtectedRoute` blocks guests until
the provider has restored the session.

## Troubleshooting

| Problem                                              | Cause / fix                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `400 PEZHWAN_...` on startup                         | Invalid env — copy `.env.example` to `.env`.                                               |
| `403 ORIGIN_REJECTED`                                | Origin not in `PEZHWAN_ALLOWED_ORIGINS`.                                                   |
| `403 CSRF_REJECTED`                                  | Missing/mismatched `X-CSRF-Token` header. Refresh it from `/v1/auth/csrf`.                 |
| `401 UNAUTHENTICATED` on valid token                 | Account disabled or `tokenVersion` bumped (password change, admin edit). Re-login.         |
| `REFRESH_TOKEN_UNKNOWN`                              | Presented refresh token was already rotated or never existed — replay the latest pair.     |
| `REFRESH_TOKEN_REUSE`                                | Old token presented again — signals theft; the whole session family is revoked. Re-login.  |
| `400 INVALID_CREDENTIALS`                            | Wrong password, or account is locked after 5 failed attempts (`PEZHWAN_LOCKOUT_DURATION`). |
| `429 Too Many Requests`                              | Hit `PEZHWAN_RATE_LIMIT_LOGIN`/`PEZHWAN_RATE_LIMIT_API`.                                   |
| Refresh via SDK fails with `SESSION_CONTEXT_INVALID` | Tenant/application context changed — session no longer valid, force re-login.              |

## Further reading

- Full endpoint reference: `docs/api/OPENAPI.yaml` (Auth, Sessions tags)
- Middleware and envelopes: `packages/express/src/routes.ts`,
  `packages/express/src/security.ts`
- Token + session lifecycle: `packages/shared/src/constants.ts`,
  `packages/core/src/services/session.service.ts`
- Reference server wiring: `apps/identity-server/src/server.ts`
- Working demo: `demos/basic-auth/`
