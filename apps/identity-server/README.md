# PEZHWAN Identity Server

Reference implementation of the PEZHWAN identity stack exposed as a standalone
Express service on port `4011`.

## Endpoints

| Route                                   | Purpose                                                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`                      | Liveness probe                                                                                                                                             |
| `GET /health/ready`                     | Readiness probe (Mongo, Redis, OTP providers + circuits)                                                                                                   |
| `POST /v1/auth/register`                | Register with email/password (→ login tokens)                                                                                                              |
| `POST /v1/auth/login`                   | Password login (MFA challenge when required)                                                                                                               |
| `POST /v1/auth/refresh`                 | Rotate refresh token                                                                                                                                       |
| `POST /v1/auth/logout`                  | Revoke session(s)                                                                                                                                          |
| `GET /v1/auth/csrf`                     | Double-submit CSRF token                                                                                                                                   |
| `POST /v1/auth/otp/*`                   | OTP send/verify + OTP login                                                                                                                                |
| `POST /v1/auth/password/change`         | Change password (rotates token version)                                                                                                                    |
| `/v1/mfa/*`                             | TOTP setup/enable/verify/disable + completion login                                                                                                        |
| `/v1/verify/*`                          | Email verify / password reset / magic link                                                                                                                 |
| `/v1/sessions`                          | List / revoke / revoke-all                                                                                                                                 |
| `/v1/oauth/*`                           | Authorization code + PKCE + token + client registration                                                                                                    |
| `GET /v1/users/me`                      | Authenticated user profile                                                                                                                                 |
| `/v1/admin/*`                           | ADMIN-role-gated admin API: stats, tenants, users/roles/permissions, OAuth clients, sessions, audit, API keys, webhooks, security, settings, subscriptions |
| `GET /v1/services/ping`                 | API-key-gated service example                                                                                                                              |
| `GET /.well-known/jwks.json`            | Public key set                                                                                                                                             |
| `GET /.well-known/openid-configuration` | OIDC discovery                                                                                                                                             |

## Config

All configuration is validated at startup by `src/config/env.ts` (Zod) against
`process.env`, which is loaded from `.env` in this directory (see
`src/server.ts`). Copy the template into place and edit:

```
cp ../../.env.example .env
```

Key variables (all `PEZHWAN_*` prefixed): `PEZHWAN_PORT`,
`PEZHWAN_ISSUER`, `PEZHWAN_TENANT_ID`, `PEZHWAN_APPLICATION_ID`,
`PEZHWAN_MONGODB_URI`, `PEZHWAN_REDIS_URL` (optional), `PEZHWAN_ACCESS_TOKEN_TTL`,
`PEZHWAN_SIGNING_KEYS_PATH`, `PEZHWAN_ALLOWED_ORIGINS`,
`PEZHWAN_OTP_EMAIL_PROVIDER`, `PEZHWAN_OTP_SMS_PROVIDER`. The `.env.example`
template at the repo root lists every accepted variable with defaults.

In dev, `PEZHWAN_SIGNING_KEYS_PATH` (default `./keys`, resolved against the
server's working directory) persists generated signing keys — the `keys/`
directory is runtime-generated and git-ignored.

## Run

```
npm run build        # tsc → dist/
npm run start        # node dist/server.js
npm run dev          # node --watch src/server.ts
```

Docker image runs the compiled server as a non-root user with a health check
against `/.well-known/jwks.json`.

Before start, run the one-time seed to create the bootstrap tenant/application
and the ADMIN role (and, when `PEZHWAN_ADMIN_EMAIL`/`PEZHWAN_ADMIN_PASSWORD`
are set, the first admin user):

```
npm run seed
```

The server also re-runs this bootstrap idempotently at startup.

## Management apps

The workspace ships two React (Vite) apps that run against this server:

| App                        | Port | Purpose                                              |
| -------------------------- | ---- | ---------------------------------------------------- |
| `pezhwan-admin-console`    | 5173 | Admin dashboard over `/v1/admin/*`                   |
| `pezhwan-developer-portal` | 5174 | Developer portal: API keys, webhooks, docs, explorer |

Both proxy `/v1` and `/.well-known` to `http://localhost:4011` during dev, so
`npm run dev -w pezhwan-admin-console` (or `-w pezhwan-developer-portal`) works
with the server running. Sign in with the bootstrapped admin user
(`PEZHWAN_ADMIN_EMAIL` / `PEZHWAN_ADMIN_PASSWORD`).

## Tests

The server surface is exercised by the workspace integration suite
(`npm run test:integration`), which boots the real routers against a transient
MongoDB and drives register → login → sessions → refresh → logout, OAuth
flows, SAML, SCIM, ABAC, event sourcing, and webhook delivery.
