# PEZHWAN Developer Portal

Self-service workspace for developers building on PEZHWAN. The portal manages
API keys, webhooks, advanced analytics, API documentation, and profile
information, and includes a live API explorer for exercising the identity
server directly from the browser.

## What it does

The portal is the developer-facing counterpart to the Admin Console. Like the
console it is ADMIN-role-gated (`RequireAuth roles={['ADMIN']}` in
`src/App.tsx`); the dashboard shows an operational overview of the tenant
(API keys, webhooks, sessions, OAuth clients, signups, failed logins, risk
events), and dedicated screens cover the developer workflow.

## Tech stack

- **React 19** (`react` / `react-dom` `^19.3.0`)
- **React Router 7** (`react-router-dom` `^7.18.3`)
- **Vite 8** (`vite` `^8.3.0`) with `@vitejs/plugin-react` for HMR
- **TypeScript** `^5.9.3`
- Plain CSS (`src/main.css`); no UI framework

Package: `pezhwan-developer-portal` (private, `type: module`).

## Features and routes

Defined in `src/App.tsx`:

| Route              | Feature                                                        |
| ------------------ | -------------------------------------------------------------- |
| `/login`           | Sign-in (`/v1/auth/login`; MFA-required accounts are rejected) |
| `/`                | Dashboard: stats cards, recent risk events, health panel       |
| `/api-keys`        | List / filter / revoke API keys (`KeyManager`)                 |
| `/api-keys/create` | Create an API key; shows the raw key once                      |
| `/webhooks`        | List webhooks, copy signing secret, send test pings            |
| `/webhooks/create` | Create a webhook subscription                                  |
| `/explorer`        | Live API explorer with presets and history (`ApiExplorer`)     |
| `/analytics`       | 7-day audit aggregation, top event types, unique users         |
| `/docs`            | In-app API documentation                                       |
| `/profile`         | Current user profile and session info                          |

### Components

- `src/components/KeyManager.tsx` — keys list with status filter, revoke, and
  copy-to-clipboard; loads `/v1/admin/api-keys`.
- `src/components/WebhookTester.tsx` — sends a synthetic signed event to a
  webhook URL via `/v1/admin/webhooks/:id/test` and reports delivery.
- `src/components/ApiExplorer.tsx` — method/path/body editor with presets
  (`/v1/users/me`, `/v1/admin/stats`, `/v1/admin/audit`, OIDC discovery, ...)
  and a response history.
- `src/components/Layout.tsx` — shared page shell.

## How the API layer works

`src/lib/api.ts` mirrors the console's envelope-based client (`{ success, data,
error }`):

- Base URL from `VITE_API_URL` (empty in dev; Vite proxies `/v1` and
  `/.well-known` to the identity server).
- Bearer token held in memory and mirrored in `localStorage` under the key
  `dp_access_token`.
- `getCsrf()` fetches `/v1/auth/csrf`; the `X-CSRF-Token` header is attached
  to non-GET requests once set.
- `401` responses clear auth state and redirect to `/login`.
- Exported surface: `getCsrf`, `login`, `currentUser`, and the `api` object
  (`get`, `post`, `patch`, `put`, `delete`).

`src/hooks/useAuth.tsx` (`AuthProvider`) restores the session from
`dp_access_token` on load and exposes `isAdmin`. Domain types — including the
`AUDIT_EVENTS` constant — are in `src/types.ts`.

## Run

```bash
npm run dev -w @pezhwan/identity-server        # terminal 1
npm run dev -w pezhwan-developer-portal        # terminal 2
```

The Vite dev server listens on **port 5174** and proxies `/v1` and `/.well-known`
to `http://localhost:4011` (override with `PEZHWAN_API_URL`). Set
`VITE_API_URL` in `apps/developer-portal/.env` to point at a different base.
Sign in with the bootstrapped admin user (see `npm run seed`).

## Build

```bash
npm run build -w pezhwan-developer-portal     # vite build → dist/
npm run typecheck -w pezhwan-developer-portal # tsc --noEmit
npm run preview -w pezhwan-developer-portal   # serve the build
```

## Documentation

- `docs/api/OPENAPI.yaml` — HTTP surface of the reference server
- `docs/api/webhooks.md` — webhook events, signing, and delivery semantics
- `docs/api/rate-limits.md` — rate-limit and retry guidance
- `docs/tutorials/` — step-by-step integration guides
- `apps/identity-server/README.md` — server run/configure instructions
