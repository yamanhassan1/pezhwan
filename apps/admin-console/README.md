# PEZHWAN Admin Console

The administrative UI for the PEZHWAN identity platform. It is a role-gated
React application for managing tenants, applications, users, roles, OAuth
clients, sessions, audit logs, subscriptions, security breaches, and risk
events through the identity server's ADMIN API (`/v1/admin/*`).

## What it does

The console is the operational control plane for a PEZHWAN deployment. Sign-in
is restricted to users holding the `ADMIN` role; every screen behind
`/login` is guarded by `RequireAuth` in `src/routes/AppRoutes.tsx`, which sends
non-admins to a 403 screen.

## Tech stack

- **React 19** (`react` / `react-dom` `^19.3.0`)
- **React Router 7** (`react-router-dom` `^7.18.3`)
- **Vite 8** (`vite` `^8.3.0`) with `@vitejs/plugin-react` for HMR
- **TypeScript** `^5.9.3`
- No UI kit — plain CSS (`src/main.css`) with a hand-rolled `DataTable`,
  chart, and form components

Package: `pezhwan-admin-console` (private, `type: module`).

## Routes

Defined in `src/routes/AppRoutes.tsx`:

| Route                | Screen                                            |
| -------------------- | ------------------------------------------------- |
| `/login`             | Sign-in (email/password via `/v1/auth/login`)     |
| `/`                  | Dashboard: stats, 7-day audit chart, risk         |
| `/users`             | List users                                        |
| `/users/create`      | Create user                                       |
| `/users/:id`         | User details                                      |
| `/users/:id/edit`    | Edit user                                         |
| `/tenants`           | List tenants                                      |
| `/tenants/create`    | Create tenant                                     |
| `/roles`             | Roles and permissions                             |
| `/clients`           | OAuth clients                                     |
| `/clients/create`    | Register an OAuth client                          |
| `/sessions`          | Active/interactive sessions                       |
| `/audit`             | Tamper-evident audit log                          |
| `/security/breaches` | Password-breach findings                          |
| `/security/risk`     | Risk-scored security events                       |
| `/subscriptions`     | Tenant plans and subscription changes             |
| `/settings`          | Admin settings (JSON, `PATCH /v1/admin/settings`) |

Shared page chrome lives in `src/components/Layout/` (sidebar, header, footer),
forms in `src/components/Forms/`, and charts (`UsageChart`, `AuditChart`) in
`src/components/Charts/`. Domain shapes are typed in `src/types/index.ts`;
`AuditEntry` carries a `sequence`/`hash`/`prevHash` chain reflecting the server's
append-only audit log.

## How the API layer works

`src/lib/api.ts` wraps `fetch` around the identity server's envelope convention
(`{ success, data, error }`):

- Base URL comes from `VITE_API_URL` (empty in dev, where Vite proxies `/v1`
  and `/.well-known` to the identity server).
- Bearer tokens are sent via the `Authorization` header and persisted under the
  `pz_admin_token` key (`setAccessToken` / `getAccessToken` / `clearAuth`).
- A double-submit `X-CSRF-Token` header is attached once obtained from
  `/v1/auth/csrf`.
- A `401` response clears local auth state and redirects to `/login`.
- Helpers: `apiGet`, `apiPost`, `apiPatch`, `apiDelete`, `login`, `currentUser`
  (`/v1/users/me`).

`src/hooks/useAuth.tsx` (`AuthProvider` / `useAuth`) hydrates the logged-in user
on load, calls `getCsrf()` before login, and exposes `isAdmin`.

## Run

The console runs against the identity-server (default `http://localhost:4011`).
Start the server first, then either app from the repository root:

```bash
npm run dev -w @pezhwan/identity-server   # terminal 1
npm run dev -w pezhwan-admin-console      # terminal 2
```

The Vite dev server listens on **port 5173** and proxies `/v1` and `/.well-known`
to `http://localhost:4011` (override with `PEZHWAN_API_URL`). To point the API
client at a different base, set `VITE_API_URL` in `apps/admin-console/.env`.

Sign in with the bootstrapped admin user (`PEZHWAN_ADMIN_EMAIL` /
`PEZHWAN_ADMIN_PASSWORD`, created by `npm run seed`).

## Build

```bash
npm run build -w pezhwan-admin-console   # vite build → dist/
npm run typecheck -w pezhwan-admin-console  # tsc --noEmit
npm run preview -w pezhwan-admin-console    # serve the build
```

## Documentation

- `docs/api/OPENAPI.yaml` — HTTP surface of the reference server
- `docs/ARCHITECTURE.md` — architecture and package relationships
- `apps/identity-server/README.md` — server run/configure instructions
- `docs/api/` — API reference, error codes, rate limits, webhooks
