# Getting Started with PEZHWAN

This guide takes you from an empty machine to a running identity server and a
successful user registration. It assumes a basic familiarity with Node.js,
npm, and MongoDB.

## 1. Prerequisites

| Prerequisite     | Version / Notes                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js          | **>= 23.6** recommended. The `dev` and `seed` scripts run TypeScript source directly via Node's native type-stripping (`node --watch src/server.ts`). That requires Node 23.6+ (or Node 22.6+ when invoked with `--experimental-strip-types`). The `engines` field still lists `>=20` for the published SDK packages, which are consumed as compiled `dist/` output. |
| npm              | Comes with Node. The repo uses npm workspaces (`npm install` at the root installs every package).                                                                                                                                                                                                                                                                    |
| MongoDB          | A running `mongod` (default URI `mongodb://localhost:27017/pezhwan`). A **replica set** is required to exercise refresh-token rotation transactions.                                                                                                                                                                                                                 |
| Redis (optional) | `redis://localhost:6379`. Redis is an optimisation layer only; when absent the runtime degrades to an in-memory cache.                                                                                                                                                                                                                                               |
| Git              | For cloning the repository.                                                                                                                                                                                                                                                                                                                                          |

> Windows note: `@pezhwan/crypto` depends on the native `argon2` module. The
> root `package.json` whitelists `argon2` install scripts
> (`allowScripts.argon2 = true`). If a rebuild of native modules fails on
> Windows, reinstall with `npm rebuild argon2 --build-from-source` (see
> [`local-development.md`](./local-development.md#common-pitfalls)).

## 2. Clone and install

```bash
git clone <repository-url> pezhwan
cd pezhwan
npm install
```

`npm install` installs all workspace packages (`packages/*`, `apps/*`) in one
pass. Building source packages is a separate step (step 4).

## 3. Install Git hooks and create `.env`

```bash
npm run setup
```

`npm run setup` runs `scripts/install-hooks.mjs`, which copies
`scripts/pre-commit.sh` into `.git/hooks/pre-commit`. Every local commit is then
scanned for obvious secrets by `scripts/secret-scan.mjs` and blocked if one is
found.

Now create your environment files. There are **two** places we read
environment variables, and it matters where you put them:

1. **The identity server** loads `apps/identity-server/.env` at boot
   (`server.ts` resolves the file relative to its source directory) and
   validates every value against the Zod schema in `src/config/env.ts`.
2. **The seed script** (`npm run seed`) reads the process environment
   directly, so any `PEZHWAN_*` value you want it to see must be set in your
   shell (or exported before you run it).

The safe local-development layout is to keep both in sync:

```bash
# 1. Server config — copy the template into the identity server's directory.
cp .env.example apps/identity-server/.env

# 2. (Optional, for the browser demo / tooling) the traditional root copy.
cp .env.example .env
```

With the shell export for the seed step (see section 6):

```powershell
$env:PEZHWAN_ADMIN_EMAIL='admin@pezhwan.local'
$env:PEZHWAN_ADMIN_PASSWORD='ChangeMe-123!'
```

On macOS/Linux use `export` instead. Remember: environment variables set in
one terminal are not visible in another — export them in the same shell you
run `npm run seed` from.

## 4. Fill in `.env`

All environment variables are validated at startup by
`apps/identity-server/src/config/env.ts` (Zod). Invalid configuration fails
fast with a list of the offending keys. The **required** variables are:

| Variable                 | Meaning                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `PEZHWAN_ISSUER`         | Public issuer URL. Must match the URL clients use to reach the server. For local dev: `http://localhost:4011`. |
| `PEZHWAN_TENANT_ID`      | Identifier of the bootstrap tenant (`dev-tenant`).                                                             |
| `PEZHWAN_APPLICATION_ID` | Identifier of the bootstrap application (`dev-app`).                                                           |

Everything else has a safe development default; the defaults in `.env.example`
are intentional and documented there. Key tunables you will touch:

| Variable                                                                         | Default                             | Notes                                                                                                  |
| -------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `PEZHWAN_PORT`                                                                   | `4011`                              | HTTP listen port.                                                                                      |
| `PEZHWAN_MONGODB_URI`                                                            | `mongodb://localhost:27017/pezhwan` | MongoDB connection string.                                                                             |
| `PEZHWAN_REDIS_URL`                                                              | `redis://localhost:6379`            | Leave empty to run without Redis (in-memory fallback).                                                 |
| `PEZHWAN_ALLOWED_ORIGINS`                                                        | `http://localhost:4011,...`         | Comma-separated exact-origin CORS allowlist.                                                           |
| `PEZHWAN_JWT_ALGORITHM`                                                          | `RS256`                             | One of `RS256`, `RS384`, `RS512`.                                                                      |
| `PEZHWAN_ACCESS_TOKEN_TTL` / `PEZHWAN_REFRESH_TOKEN_TTL` / `PEZHWAN_SESSION_TTL` | `15m` / `30d` / `30d`               | Token lifetimes (ms, `s`, `m`, `h`, `d` suffixes).                                                     |
| `PEZHWAN_BODY_LIMIT`                                                             | `100kb`                             | Max JSON request body, enforced by `express.json`.                                                     |
| `PEZHWAN_SIGNING_KEYS_PATH`                                                      | `./keys`                            | Directory that persists the signing keystore (auto-generated on first boot).                           |
| `PEZHWAN_LOG_LEVEL`                                                              | `info`                              | `debug`, `info`, `warn`, or `error`.                                                                   |
| `PEZHWAN_ADMIN_EMAIL` / `PEZHWAN_ADMIN_PASSWORD`                                 | (empty)                             | When both are set, the bootstrap creates the first `ADMIN` user idempotently. Never set in production. |

Generate any secrets you need locally and never commit them:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 5. Build the workspace

Pezhwan is a layered monorepo; packages are consumed as **built** `dist/`
output, so compile before running anything:

```bash
npm run build
```

This runs `tsc -p tsconfig.json` in dependency order across all workspaces
(`shared` -> `crypto` -> `oauth` -> `core` -> `node` -> `express` -> `react` ->
identity-server -> admin-console -> developer-portal). If you only changed one
package, rebuild just that package:

```bash
npm run build -w @pezhwan/core
```

## 6. Seed and start the identity server

Seed the database (idempotent: creates the bootstrap tenant, default
application, and `ADMIN` role, plus the admin user when configured). Because
`npm run seed` reads `process.env` directly, export the bootstrap-admin
variables in this shell first if you want the admin user created — the values
inside `.env` files are not picked up by this script:

```bash
# For the admin user to be created, these must be present in your shell:
export PEZHWAN_ADMIN_EMAIL='admin@pezhwan.local'   # PowerShell: $env:PEZHWAN_ADMIN_EMAIL=...
export PEZHWAN_ADMIN_PASSWORD='ChangeMe-123!'

npm run seed
```

If you skip the exports, seeding still succeeds — every step has a safe
default and an existence guard — but the bootstrap admin is not created, and
later ADMIN-gated steps (e.g. OAuth client registration) will need an admin
account created another way.

Now start the identity server in watch mode (auto-restarts on source changes):

```bash
npm run dev -w @pezhwan/identity-server
```

The server runs on `http://localhost:4011` by default. Watch the console:
it re-runs the bootstrap idempotently, reports MongoDB connection status, and
logs the mounted routes.

## 7. Verify the server

```bash
# Liveness — process is up
curl http://localhost:4011/health/live

# Readiness — Mongo (and Redis/OTP providers if configured)
curl http://localhost:4011/health/ready

# Public key set used to verify signed access tokens
curl http://localhost:4011/.well-known/jwks.json

# OIDC discovery document
curl http://localhost:4011/.well-known/openid-configuration
```

`/health/ready` returns `200` when Mongo is connected, and `503` otherwise. The
`/.well-known/jwks.json` response should contain at least one `RS256` key with a
`kid`.

## 8. Register a user

### Via the browser demo

The identity server serves a development-only demo at the root. Open
`http://localhost:4011/` and register with an email and password.

### Via curl

State-changing endpoints require the CSRF double-submit cookie. Get it once,
then reuse it:

```bash
# 1. Obtain the pezhwan_csrf cookie (safe request sets it + returns the token)
curl -s -c cookies.txt http://localhost:4011/v1/auth/csrf
# {"success":true,"csrfToken":"<token>"}
CSRF="<token>"

# 2. Register (201 on success, tokens in the response)
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"user@example.com","password":"<pw>","metadata":{"plan":"demo"}}' \
  http://localhost:4011/v1/auth/register

# 3. Login, refresh, get the user profile
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"user@example.com","password":"<pw>"}' \
  http://localhost:4011/v1/auth/login

curl -s -H "Authorization: Bearer <accessToken>" http://localhost:4011/v1/users/me
```

## 9. Use an SDK

### Node SDK (server-side)

```ts
import { Pezhwan } from '@pezhwan/node';

const pezhwan = Pezhwan({
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'http://localhost:4011',
  audience: 'pezhwan.clients',
  otpDelivery: { sendEmail: async (to, code) => console.log(`OTP for ${to}: ${code}`) },
});

const { user } = await pezhwan.auth.register({
  email: 'api@example.com',
  password: '<pw>',
});
const { tokens } = await pezhwan.auth.loginPassword({
  email: 'api@example.com',
  password: '<pw>',
});
```

### React SDK (browser)

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
```

## Next steps

- Learn the everyday development loop in [`local-development.md`](./local-development.md).
- Run the test suites covered by [`testing.md`](./testing.md).
- Read the package READMEs under `packages/*/` for each SDK's full surface.
