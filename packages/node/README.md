# @pezhwan/node

The Node.js SDK for PEZHWAN — a thin, ergonomic facade over
[`@pezhwan/core`](../core/README.md) for Node.js services that need real
identity without tying themselves to a web framework. If you are building an
Express (or Express-compatible) HTTP service, you will most often want
[`@pezhwan/express`](../express/README.md) instead; use this package when you
are writing background jobs, CLIs, workers, gRPC services, or any other
non-HTTP process that still needs to sign tokens, verify sessions, run
password checks, or enforce authorization.

## Installation

```bash
npm install @pezhwan/node
```

`@pezhwan/node` re-exports everything from `@pezhwan/core`, so this one
dependency is enough for most server-side work.

## Quick start

```ts
import { Pezhwan } from '@pezhwan/node';

const runtime = Pezhwan({
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'https://id.example.com',
  audience: 'pezhwan.clients',
  otpDelivery: {
    sendEmail: async (to, code) => {
      // Wire your email provider (e.g. SES, SendGrid, Postmark) here.
      await sendEmail(to, `Your Pezhwan code is ${code}`);
    },
  },
});

// Register a new user
const { user } = await runtime.auth.register({
  email: 'ada@example.com',
  password: 'Str0ng!Pass#2026',
});

// Password login — returns tokens directly, or surfaces an MFA challenge.
const { tokens, challenge } = await runtime.auth.loginPassword({
  email: 'ada@example.com',
  password: 'Str0ng!Pass#2026',
});
```

### What do the required options mean?

| Option          | Purpose                                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenantId`      | The tenant this runtime instance is scoped to. Every tenant-scoped query flows through it — never trust the client for tenant selection.             |
| `applicationId` | The application within that tenant (defines the audience and policy bucket).                                                                         |
| `issuer`        | The public issuer URL. Must match the value that verifiers of your tokens will check (`iss` claim).                                                  |
| `audience`      | Expected audience for issued tokens (`aud` claim).                                                                                                   |
| `otpDelivery`   | Callbacks that deliver one-time codes for email and/or phone. Required because OTP is always turned on; supply no-op callbacks if you do not use it. |

## Constructing the runtime

`Pezhwan(config)` is a thin wrapper over `createPezhwan(config)` from
`@pezhwan/core`. It validates your configuration eagerly at startup and wires
the full stack — keystore, tokens, sessions, OTP, RBAC authorization, account
state, and audit log — so integration bugs surface immediately rather than at
request time.

For a more explicitly object-oriented flavour, the same runtime is available
as a class with typed getters over each subsystem:

```ts
import { createRuntimeClient } from '@pezhwan/node';

const client = createRuntimeClient({/* same config as above */});

await client.auth.register({ email: 'grace@example.com', password: '<pw>' });
await client.authorization.assignRole(userId, 'ADMIN');
const tokens = await client.oauth.exchangeCode({ code: '...', verifier: '...' });
```

> Note: `PezhwanClient` is exported for backward compatibility with earlier
> releases of this package. Prefer `Pezhwan(config)` or `createRuntimeClient`
> when starting something new.

## What you get back: the runtime surface

Every subsystem is reachable from the runtime you construct. The full list:

| Property                 | Service                    | Use it for                                                                                   |
| ------------------------ | -------------------------- | -------------------------------------------------------------------------------------------- |
| `auth`                   | `AuthEngine`               | Register, login (password / OTP / MFA), logout, refresh, password reset, email verification. |
| `sessions`               | `SessionService`           | Refresh-token families, rotation, reuse detection, session lifecycle.                        |
| `authorization`          | `AuthorizationService`     | RBAC roles/permissions, and the optional ABAC / expression policy engines.                   |
| `mfa`                    | `MfaService`               | TOTP enrolment, enable/disable, step-up verification.                                        |
| `oauth`                  | `OAuthService`             | Authorization-code and client-credentials flows against your own OAuth clients.              |
| `apiKeys`                | `ApiKeyService`            | Issue and manage API keys (their hashes, never the raw material).                            |
| `tokens`                 | `TokenService`             | Sign and verify access/refresh tokens.                                                       |
| `verificationTokens`     | `VerificationTokenService` | Email verification and password-reset tokens.                                                |
| `accountState`           | `AccountStateService`      | Fail-closed validation of whether an identity is still valid.                                |
| `audit`                  | `AuditService`             | Append-only audit event log.                                                                 |
| `rateLimiter`            | `RateLimitService`         | Per-budget limits (login, register, OTP, refresh, API).                                      |
| `webhooks`               | `WebhookService`           | Signed event delivery to your own endpoints.                                                 |
| `metrics`                | `MetricsRegistry`          | In-process counters/gauges for observability.                                                |
| `quota`                  | `QuotaService`             | Per-resource tenant quotas.                                                                  |
| `organizations`, `teams` | tenant services            | Organization and team models.                                                                |
| `logger`                 | `PezhwanLogger`            | Structured, secret-redacting logger.                                                         |
| `trace`                  | request correlation        | `{ requestId }` for the current execution.                                                   |
| `store`                  | key store                  | The active signing-key store (exposes `jwks()`).                                             |
| `cache`                  | `RedisCache`               | The cache layer (in-memory fallback when Redis is absent).                                   |

## Errors

All error classes from `@pezhwan/shared` and `@pezhwan/core` are re-exported.
The ones you will reach for most are explicitly re-exported at the package root:

```ts
import {
  PezhwanError,
  AuthenticationError, // 401 — credentials or token problems
  AuthorizationError, // 403 — identity is valid but lacks roles/permissions
  ValidationError, // 400 — malformed input
  RateLimitError, // 429 — budget exhausted
  TokenError, // invalid/expired tokens
  SessionError, // session lifecycle problems
} from '@pezhwan/node';
```

Every error carries a stable machine-readable `code`, an HTTP-friendly
`status`, and — when known — a `requestId` that matches the server-side log
lines from the `trace` context.

```ts
try {
  await runtime.auth.loginPassword({ email, password });
} catch (err) {
  if (err instanceof AuthenticationError) {
    console.error('Bad credentials:', err.code);
  }
}
```

## The facade helpers

If you prefer working with functions rather than property access, each
subsystem is also exposed as a pure function that takes the runtime:

```ts
import { Pezhwan, auth, session, authorization, mfa } from '@pezhwan/node';

const runtime = Pezhwan({/* ... */});
const authEngine = auth(runtime); // === runtime.auth
const sessionService = session(runtime); // === runtime.sessions
const authorizationService = authorization(runtime);
const mfaService = mfa(runtime);
```

This keeps the runtime itself remain a plain data structure — handy for
dependency injection — while your call sites stay explicit and discoverable.

## Working example: password auth + session hygiene

```ts
import { Pezhwan, AuthenticationError } from '@pezhwan/node';

const runtime = Pezhwan({
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'https://id.example.com',
  audience: 'pezhwan.clients',
  otpDelivery: { sendEmail: async () => {} },
});

async function loginAndListSessions(email: string, password: string) {
  const result = await runtime.auth.loginPassword({ email, password });

  if (result.challenge) {
    // MFA is required to complete login — route the user through the
    // MFA flow (runtime.mfa) or a login form that collects the TOTP.
    return { mfaRequired: true, userId: result.challenge.userId };
  }

  const { tokens } = result;
  const profile = await runtime.auth.getUser(tokens.userId);

  const activeSessions = await runtime.sessions.retrieveActiveSessions(
    tokens.userId,
    tokens.sessionId,
  );

  return { profile, activeSessions };
}

loginAndListSessions('ada@example.com', 'Str0ng!Pass#2026').catch((err) => {
  if (err instanceof AuthenticationError) {
    // Surface a friendly "check your credentials" message.
  }
});
```

## Related docs

- [`docs/developer/GETTING-STARTED.md`](../../docs/developer/GETTING-STARTED.md) — end-to-end setup of the identity server this SDK talks to.
- [`docs/tutorials/simple-auth.md`](../../docs/tutorials/simple-auth.md) — password auth from server to browser.
- [`@pezhwan/express`](../express/README.md) — bring the same engine into an Express app as middleware and routers.
