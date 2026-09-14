# @pezhwan/express

Express middleware and pre-wired routers that turn a
[`@pezhwan/core`](../core/README.md) runtime into a full HTTP identity surface:
authentication, sessions, MFA, OAuth/OIDC, verification, rate limiting,
API-key auth, and security headers.

## Installation

```bash
npm install @pezhwan/express @pezhwan/core
```

`@pezhwan/express` works with Express 4 or 5 (declared as a peer dependency).

## Quick start

```ts
import express from 'express';
import { createPezhwan } from '@pezhwan/core';
import {
  createAuthenticate,
  requireAuth,
  requireRole,
  buildRouters,
  jwksHandler,
  requestContext,
} from '@pezhwan/express';

const runtime = createPezhwan({
  tenantId: process.env.PEZHWAN_TENANT_ID!,
  applicationId: process.env.PEZHWAN_APPLICATION_ID!,
  issuer: process.env.PEZHWAN_ISSUER!,
  audience: 'pezhwan.clients',
  otpDelivery: {
    sendEmail: async (to, code) => {
      await sendEmail(to, `Your Pezhwan code is ${code}`);
    },
  },
});

const app = express();
app.use(express.json());
app.use(requestContext(runtime));

// Serve the public key set so JWTs can be verified anywhere.
app.get('/.well-known/jwks.json', jwksHandler(runtime));

// Mount the domain routers under their conventional prefixes.
const routers = buildRouters(runtime);
app.use('/v1/auth', routers.auth);
app.use('/v1/sessions', routers.sessions);
app.use('/v1/mfa', routers.mfa);

// Protect a private area: identity + role gate.
app.use('/v1/admin', createAuthenticate(runtime), requireAuth(), requireRole('ADMIN'));
```

> Note: `createPezhwan` requires `tenantId`, `applicationId`, `issuer`,
> `audience`, and `otpDelivery`. Construct the runtime once at boot and share
> it across your app — never per request.

## Identity middleware

Every identity middleware derives its decision from the **verified access
token** — never from `req.body.role`, `req.body.userId`, or anything else the
client sends.

| Middleware                         | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `extractToken(req)`                | Pull the raw access token from the `Authorization: Bearer` header or the `pezhwan_access` cookie. Returns `string \| null`.                                                                                                                                                                                                                                                                                                                    |
| `createAuthenticate(runtime)`      | Verify the token, re-check live account state (fail closed), and attach the verified identity to `req.pezhwan`. Never throws into the handler — unauthenticated requests pass through with no identity and are caught by the `require*` gates below. If the token is cryptographically valid but account state can't be verified (dependency outage), it forwards a `503 SecurityDependencyError` — "cannot check" must resolve to "rejected". |
| `requireAuth()`                    | Reject with `401 UNAUTHENTICATED` when no valid identity is present.                                                                                                                                                                                                                                                                                                                                                                           |
| `requireRole('ADMIN')`             | Reject with `403 ROLE_REQUIRED` when the identity lacks the role.                                                                                                                                                                                                                                                                                                                                                                              |
| `requirePermission('ride:create')` | Reject with `403 PERMISSION_REQUIRED` when the identity lacks the permission.                                                                                                                                                                                                                                                                                                                                                                  |
| `jwksHandler(runtime)`             | Serve `{ keys }` from the runtime key store (5-minute `Cache-Control`).                                                                                                                                                                                                                                                                                                                                                                        |
| `requestContext(runtime)`          | Attach per-request correlation (`runtime.trace.requestId`) and connect the logger/metrics to the request lifecycle.                                                                                                                                                                                                                                                                                                                            |

`req.pezhwan` is an `IdentityContext` on the extended `PezhwanRequest` type:

```ts
app.get('/me', createAuthenticate(runtime), requireAuth(), (req, res) => {
  res.json({ user: req.pezhwan }); // { userId, tenantId, roles, permissions, ... }
});
```

Machine identities (client-credentials / API-key tokens) are validated by
signature (and live key lookup for API keys), never by a user-account lookup —
their `sub` is `client:<id>` or `apikey:<id>`.

## API keys

Server-to-server auth uses the **`X-API-Key`** header. The key is hashed and
matched against the stored hash; success attaches an `api_key` identity whose
permissions are the key's scopes.

```ts
import { createAuthenticate, createAuthenticateApiKey, requireApiKey } from '@pezhwan/express';

app.use('/v1/services', createAuthenticateApiKey(runtime), requireApiKey());
```

| Helper                              | Behaviour                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `extractApiKey(req)`                | Read the key from the `X-API-Key` header.                                                               |
| `createAuthenticateApiKey(runtime)` | Verify the key, attach the `api_key` identity, and write an audit event. Never throws into the handler. |
| `requireApiKey()`                   | Reject with `401 API_KEY_REQUIRED` when the request is not an authenticated API-key call.               |

## Rate limiting

```ts
import { rateLimit } from '@pezhwan/express';

app.use('/v1/auth/login', rateLimit(runtime, { type: 'login' }));
app.use('/v1/auth/otp/send', rateLimit(runtime, { type: 'otp' }));
```

- Budgets: `login`, `register`, `otp`, `refresh`, `api`, `mfa` (core defaults,
  overridable in the runtime config).
- Scope defaults to the client IP; pass a custom `scope` extractor for
  authenticated endpoints so a shared NAT doesn't lock out legit users:
  `rateLimit(runtime, { type: 'api', scope: (req) => req.pezhwan?.userId ?? req.ip })`.
- Denials answer `429` with `Retry-After` and `X-RateLimit-*` headers. If the
  limiter itself fails, the request is **allowed through** (Redis is an
  optimiser, never a gate).

## Security middleware

| Helper                                   | Behaviour                                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `securityHeaders(options)`               | Sensible security headers (CSP, X-Content-Type-Options, HSTS framing, …).                                         |
| `csrfProtection(options)`                | Double-submit CSRF cookie validation for state-changing requests (`pezhwan_csrf` cookie + `X-CSRF-Token` header). |
| `corsAllowlist({ allowedOrigins, ... })` | Exact-origin CORS allowlist.                                                                                      |
| `requestContext(runtime)`                | Request correlation, logger, and metrics context.                                                                 |

## Routers

`buildRouters(runtime)` returns ten pre-wired routers under one object:

| Router          | Typical mount       | Purpose                                                                                                           |
| --------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `auth`          | `/v1/auth`          | register, login, logout, refresh, OTP send/verify/login, password change/forgot/reset, email verify, CSRF cookie. |
| `sessions`      | `/v1/sessions`      | list, revoke one, revoke all.                                                                                     |
| `oauth`         | `/v1/oauth`         | authorize, token, clients (OAuth 2.1 / OIDC wire format, not the envelope).                                       |
| `mfa`           | `/v1/mfa`           | TOTP setup, enable, verify, disable, MFA login.                                                                   |
| `verification`  | `/v1/verify`        | password-reset and email-verification token flows.                                                                |
| `scim`          | `/v1/scim`          | SCIM 2.0 user/group provisioning.                                                                                 |
| `webhooks`      | `/v1/webhooks`      | register/list webhook endpoints and their deliveries.                                                             |
| `subscriptions` | `/v1/subscriptions` | subscription management.                                                                                          |
| `teams`         | `/v1/teams`         | team management.                                                                                                  |
| `graphql`       | `/v1/graphql`       | GraphQL endpoint.                                                                                                 |

Each router also has a matching `create*Router(runtime)` factory, so you can
mount only what you need:

```ts
import { createAuthRouter, createSessionRouter, createOauthRouter } from '@pezhwan/express';

app.use('/v1/auth', createAuthRouter(runtime));
app.use('/v1/sessions', createSessionRouter(runtime));
app.use('/v1/oauth', createOauthRouter(runtime));
```

> Domain routers whose backing subsystem is not part of the core engine
> (graphql, scim, subscription, team, webhook) answer
> `503 { code: 'FEATURE_NOT_ENABLED' }` — the contract exists and it fails
> loudly rather than fabricating data.

To expose only graphql + scim and stay minimal:

```ts
const { graphql, scim } = buildRouters(runtime);
app.use('/v1/graphql', graphql);
app.use('/v1/scim', scim);
```

## Error envelope

Every successful response is `{ success: true, data }`; failures are
`{ success: false, error: { code, message, requestId } }`. OAuth/OIDC
endpoints (`/v1/oauth/*`, `/.well-known/*`) follow the OAuth 2.1 / OIDC wire
format instead. The full request/response contract lives in
[`docs/api/OPENAPI.yaml`](../../docs/api/OPENAPI.yaml).

Add a final error-handling middleware so envelope errors serialize correctly:

```ts
import { PezhwanError } from '@pezhwan/shared';

app.use((err, _req, res, _next) => {
  if (err instanceof PezhwanError) {
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, requestId: runtime.trace.requestId },
    });
  }
  console.error(err);
  res
    .status(500)
    .json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } });
});
```

## Package layout (for contributors)

- `src/security.ts` — security-header, CSRF, CORS, and request-context middleware.
- `src/apikey.ts` — API-key extraction and middleware.
- `src/rateLimit.ts` — rate-limiting middleware wrapping core `RateLimitService`.
- `src/routes*.ts` + `src/routes/` — per-domain router factories.
- `src/middleware.ts` / `src/rate-limit.ts` — facade and kebab mirrors used
  internally by the package; prefer the exports from the package root.

## Related docs

- [`docs/developer/GETTING-STARTED.md`](../../docs/developer/GETTING-STARTED.md) — boot the identity server this API surface models.
- [`docs/api/errors.md`](../../docs/api/errors.md) — full error taxonomy.
- [`docs/api/rate-limits.md`](../../docs/api/rate-limits.md) — the budgets these middleware enforce.
- [`@pezhwan/core`](../core/README.md) — the engine behind the middleware.
