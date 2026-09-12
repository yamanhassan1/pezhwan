# Local Development

This document describes the day-to-day development loop in the Pezhwan
monorepo: what to build, how to watch, how to run the infrastructure, how to
run demos, and the pitfalls that waste the most time.

## The build model

The monorepo is a strict layer cake (see `docs/ARCHITECTURE.md`). Packages are
compiled with `tsc` into `packages/*/dist/` and consumers import the **built**
output, never the sources. This means:

- After you edit any package, you **must rebuild it** before the change is
  visible to dependent packages or the identity server.
- Never import a sibling package by relative path or via its `src/` — use the
  package name (`import { createPezhwan } from '@pezhwan/core'`).

### Build order

Build dependencies first; `npm run build` at the root already respects it:

```
@pezhwan/shared → @pezhwan/crypto → @pezhwan/oauth → @pezhwan/core
→ @pezhwan/node → @pezhwan/express → @pezhwan/react
→ apps/identity-server → admin-console → developer-portal
```

Build a single package (fast, when only one layer changed):

```bash
npm run build -w @pezhwan/crypto
npm run dev -w @pezhwan/identity-server   # consumers of the new dist
```

`npm run typecheck` runs `tsc --noEmit` in every workspace. `npm run clean`
removes each workspace's `dist/`.

## Watch-mode alternatives

There is no single "build everything on save" script in the repo (run
`npm run dev -w @pezhwan/identity-server` to watch only the server source).
Two patterns work well:

1. **`tsc -w` per package.** Open one terminal per package you are editing:
   ```bash
   npm run build -w @pezhwan/core     # once, to seed dist/
   npx tsc -p packages/core/tsconfig.json -w
   ```
   This re-emits `dist/` on every save. Rebuild dependents (`express`,
   `identity-server`) when their types change.

2. **Server watch.** The identity server runs TypeScript directly with Node's
   `--watch`:
   ```bash
   npm run dev -w @pezhwan/identity-server   # node --watch src/server.ts
   ```
   Source edits to the server restart it; edits inside a dependency require
   that dependency to be rebuilt first.

`nodemon.json` exists at the repo root (placeholder); the intended loop is the
two patterns above — `tsc -w` for packages, `node --watch` for the server and
demos.

## Infrastructure: Docker Compose

`infrastructure/docker/docker-compose.yml` provides a complete dev stack:

- **MongoDB 7** three-node replica set (`pezhwan-rs`, `127.0.0.1:27017`) —
  transactions (required for atomic refresh-token rotation) work out of the box.
- **Redis 7** (`127.0.0.1:6379`) — rate limits, OTP, session-cache state.
- **identity-server** service — builds the workspace image and runs the server.

```bash
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

Validate the file without starting anything:

```bash
npm run verify:compose   # docker compose ... config --quiet
```

Alternative lighter setups: a single local `mongod` (no transactions ->
rotation tests that require a replica set will fail), or a
`mongodb-memory-server` replica set via the test harness (no Docker needed,
see `testing.md`). The default `PEZHWAN_MONGODB_URI` points at
`mongodb://localhost:27017/pezhwan`.

> Note: for the local (non-replica) case, drop stale indexes from older
> schemas if register fails with `11000 duplicate key … tenantId/phone`:
> `db.users.dropIndex('tenantId_1_phone_1'); db.users.dropIndex('tenantId_1_email_1')`.

## Running the demos

`demos/` contains standalone, SDK-backed example apps (each its own Express
server + vanilla-JS UI). They resolve packages from the root workspace — no
install needed — and run on distinct ports:

```bash
cd demos/basic-auth && npm start                    # 5175
# or any of: passwordless, mfa-demo, passkeys, social-login,
#            oauth-demo, multi-tenant, machine-to-machine
```

Each demo connects to the same Mongo, adopts durable signing keys from
`demos/<name>/keys`, and needs only `MONGODB_URI` (default
`mongodb://localhost:27017/pezhwan`) to run.

## Debugging

- `.vscode/launch.json` holds IDE debug configurations (see
  [`debugging.md`](./debugging.md#vs-code-launch-configurations)).
- Set `PEZHWAN_LOG_LEVEL=debug` in `.env` for verbose structured logs.
- Every request is assigned a `requestId`; log lines and error envelopes carry
  it, so correlate an HTTP failure with its server log.

## Common pitfalls

- **Stale `dist/`.** The number-one issue: you edited `packages/core/src`, the
  server still imports the old `dist/`. Rebuild the package
  (`npm run build -w @pezhwan/core`) and restart the server.
- **Fresh checkout that will not build.** `npm install` must finish with the
  `argon2` install script allowed. If a fresh clone fails on `argon2`, run
  `npm rebuild argon2 --build-from-source` (or ensure npm `allowScripts` is
  honoured by your npm version).
- **Native module rebuilds on Windows.** `argon2` (and any other native dep)
  must match your Node ABI. After a Node upgrade or `npm install` that
  re-resolves native packages, rebuild: `npm rebuild argon2`. If VS Build
  Tools are missing, install them and retry.
- **Missing `.env`.** The server fails fast with a Zod error listing the
  missing keys. Copy `.env.example` -> `.env` and set `PEZHWAN_ISSUER`,
  `PEZHWAN_TENANT_ID`, `PEZHWAN_APPLICATION_ID`.
- **CSRF 403s via curl.** State-changing endpoints require the `pezhwan_csrf`
  cookie plus a matching `X-CSRF-Token` header. Obtain both from
  `GET /v1/auth/csrf` first (see `GETTING-STARTED.md`).
- **CORS origin rejected.** The browser origin must be in
  `PEZHWAN_ALLOWED_ORIGINS` exactly (scheme + host + port). Add it to `.env`.
- **Registration `11000` duplicate-key.** Stale partial indexes from an older
  schema; drop `tenantId_1_email_1` / `tenantId_1_phone_1` on `users` once.
- **Slow cold start.** First boot downloads/initialises nothing, but
  integration tests download the `mongodb-memory-server` binary on first run —
  offline environments will hang there.