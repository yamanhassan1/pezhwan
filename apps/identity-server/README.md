# PEZHWAN Identity Server

Reference implementation of the PEZHWAN identity stack exposed as a standalone
Express service on port `4011`.

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /health/live` | Liveness probe |
| `GET /health/ready` | Readiness probe (Mongo, Redis, OTP providers + circuits) |
| `POST /v1/auth/register` | Register with email/password (→ login tokens) |
| `POST /v1/auth/login` | Password login (MFA challenge when required) |
| `POST /v1/auth/refresh` | Rotate refresh token |
| `POST /v1/auth/logout` | Revoke session(s) |
| `GET /v1/auth/csrf` | Double-submit CSRF token |
| `POST /v1/auth/otp/*` | OTP send/verify + OTP login |
| `POST /v1/auth/password/change` | Change password (rotates token version) |
| `/v1/mfa/*` | TOTP setup/enable/verify/disable + completion login |
| `/v1/verify/*` | Email verify / password reset / magic link |
| `/v1/sessions` | List / revoke / revoke-all |
| `/v1/oauth/*` | Authorization code + PKCE + token + client registration |
| `GET /v1/users/me` | Authenticated user profile |
| `/v1/admin/*` | ADMIN-role-gated admin API: stats, tenants, users/roles/permissions, OAuth clients, sessions, audit, API keys, webhooks, security, settings, subscriptions |
| `GET /v1/services/ping` | API-key-gated service example |
| `GET /.well-known/jwks.json` | Public key set |
| `GET /.well-known/openid-configuration` | OIDC discovery |

## Config

All configuration is validated at startup by `src/config/env.ts` (Zod) against
`process.env`. Copy the template and edit:

```
cp ../../.env.example .env
```

Key variables: `PORT`, `MONGODB_URI`, `ISSUER`, `TENANT_ID`,
`APPLICATION_ID`, `JWT_ACCESS_TTL_MS`, `SIGNING_KEYS_PATH`,
`OTP_EMAIL_PROVIDER`, `OTP_SMS_PROVIDER`, `REDIS_URL` (optional), `CORS_ALLOWED_ORIGINS`.

In dev, `SIGNING_KEYS_PATH=../../keys` persists generated signing keys (JWT
signature — the `keys/` directory is runtime-generated and git-ignored).

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

| App                | Port  | Purpose                                            |
|--------------------|-------|----------------------------------------------------|
| `pezhwan-admin-console` | 5173 | Admin dashboard over `/v1/admin/*`                 |
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