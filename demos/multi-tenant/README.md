# PEZHWAN · Multi-Tenant Demo

Two tenants side-by-side teaching isolation: the same email creates **separate
accounts** in Tenant A and Tenant B, and a token minted by one tenant's runtime
is **rejected** by the other. The demo runs **two** `PezhwanRuntime`
instances, each with its own durable signing keys.

## What this demo shows

- Two runtimes built by `buildRuntime` (`server.ts:36`):
  - **Tenant A** — tenant `dev-tenant`, application `dev-app`.
  - **Tenant B** — tenant `tenant-b`, application `app-b`.
- `initKeyPersistence` with **separate key directories** `keys-a` / `keys-b`
  (`server.ts:53`), so Tenant B can never verify a Tenant A token even if the
  claims were replayed.
- Per-tenant register/login and per-tenant `createAuthenticate` middleware.
- **Cross-tenant rejection** — a token sent to the *opposite* tenant is
  rejected with `CROSS_TENANT_REJECTED` 401 (`server.ts:207`), shown live by
  the A→A / A→B / B→A / B→B buttons in the UI.
- Token inspector that renders the `tenantId` / `applicationId` JWT claims.

## Key files

| File | Role |
|------|------|
| `server.ts` | Express app: two runtimes + two key stores, tenant-scoped routes, cross-tenant middleware test |
| `index.html` | Split-panel SPA — register/login per tenant, cross-tenant validation buttons, event log |
| `keys-a/` / `keys-b/` | Per-tenant durable signing key directories |

### API surface (`server.ts`)

- `POST /api/tenants/:tenant/register` and `/login` (`a` | `b`).
- `GET /api/tenants/a/me` / `/b/me` — validated by that tenant's middleware.
- `GET /api/tenants/:tenant/me/cross` — runs the *opposite* middleware to
  demonstrate rejection.
- `POST /api/tenants/a/logout` / `/b/logout`.

## Required configuration

**Self-contained.** The demo embeds `@pezhwan/core` and connects directly to
MongoDB — it does *not* call the identity-server. `ISSUER` defaults to
`http://localhost:4011` purely to stamp the same `iss` claim the identity-server
uses, so tokens share the same contract.

| Environment variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/pezhwan` | Shared database |
| `PORT` | `5181` | HTTP listen port |
| `TENANT_A_ID` / `TENANT_A_APP` | `dev-tenant` / `dev-app` | Tenant A identity |
| `TENANT_B_ID` / `TENANT_B_APP` | `tenant-b` / `app-b` | Tenant B identity |
| `ISSUER` | `http://localhost:4011` | JWT `iss` claim |

Each tenant's identity values must also exist on the identity-server (if you
run one) so that `dev-tenant`/`tenant-b` resolve to real applications.

## Run it

Prerequisites: Node.js **>= 24** (demos run TypeScript directly via type
stripping) and a local MongoDB (`mongodb://localhost:27017`).

1. From the repo root, install and build the workspace packages once:
   ```bash
   npm install
   npm run build
   ```
2. *Full-stack context only — not required.* Start the identity-server on 4011:
   ```bash
   npm run dev -w @pezhwan/identity-server
   ```
   The demo runs fine without it.
3. From this directory:
   ```bash
   npm run dev     # node --watch server.ts → http://localhost:5181
   ```
   or `npm start` for a single run (`node server.ts`).

## Use it

1. Register `ada@example.com` in **both** cards (defaults are prefilled) —
   note the two distinct user IDs.
2. Press **A token → B** and **B token → A** — both fail with
   `CROSS_TENANT_REJECTED`; same-tenant combinations succeed.
3. Inspect each token payload: `tenantId` / `applicationId` identify the
   issuing tenant.

## Troubleshooting

- **`11000 duplicate key … tenantId/email`** — same-user-per-tenant is by
  design, but *stale non-partial indexes* from an older schema make even the
  first register fail. Drop them once:
  `db.users.dropIndex('tenantId_1_phone_1'); db.users.dropIndex('tenantId_1_email_1')`.
- **A→B always rejected** — correct behavior: separate key stores mean no
  cross-tenant verification, plus the `iss`/`aud` claims differ.
- **`INVALID_TENANT`** — the route key is not `a` or `b`.
- **CORS** — everything is same-origin on `localhost:5181`; a cross-origin UI
  would need allow-listing on the server.