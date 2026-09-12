# PEZHWAN · Basic Auth Demo

Email/password register + login with `AuthService`, a client-side JWT
inspector, refresh-token rotation, and active-session management through
`SessionsService`. This is the canonical "first demo" — the minimal surface of
the PEZHWAN SDK.

## What this demo shows

- `runtime.auth.register` — create a user (password policy: 8+ chars with
  upper + lower case and a digit).
- `runtime.auth.loginPassword` — exchange credentials for access + refresh
  tokens.
- `runtime.sessions.refresh` / `runtime.tokens.signAccessToken` — access-token
  refresh with session rotation.
- `runtime.sessions.listActive` / `.revoke` — list and revoke active sessions.
- `createAuthenticate` + `requireAuth` from `@pezhwan/express` — Express
  middleware that validates a `Bearer` JWT and attaches the identity to the
  request as `req.pezhwan`.
- A no-dependency JWT inspector in the SPA (base64-decodes header/payload).

## Key files

| File | Role |
|------|------|
| `server.ts` | Express app: builds the `PezhwanRuntime`, persists signing keys, serves the API and `index.html` |
| `index.html` | Vanilla-JS SPA — register, login, profile, sessions list/revoke, refresh, logout, token inspector |
| `keys/` | Durable signing keys created on first boot by `initKeyPersistence` |

### API surface (`server.ts`)

- `POST /api/register` — `auth.register`, scoped to `TENANT_ID`/`APPLICATION_ID`.
- `POST /api/login` — `auth.loginPassword`; returns `mfaRequired: true` and
  stops if the account has TOTP enrolled (MFA is out of scope here).
- `GET /api/me` — protected by `createAuthenticate` + `requireAuth`.
- `GET /api/sessions` / `POST /api/sessions/:id/revoke` — sessions list/revoke.
- `POST /api/refresh` — rotates the refresh token and re-signs an access token.
- `POST /api/logout` — revokes the current session.

## Required configuration

**Self-contained.** The demo embeds `@pezhwan/core` and connects directly to
MongoDB — it does *not* call the identity-server. `ISSUER` defaults to
`http://localhost:4011` purely to stamp the same `iss` claim the identity-server
uses, so tokens share the same contract.

| Environment variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/pezhwan` | Shared database |
| `PORT` | `5175` | HTTP listen port |
| `TENANT_ID` | `dev-tenant` | Tenant the demo runs as |
| `APPLICATION_ID` | `dev-app` | Application within the tenant |
| `ISSUER` | `http://localhost:4011` | JWT `iss` claim |
| `MFA_ENCRYPTION_KEY` | 32-byte base64 default | AES-256-GCM key for the runtime |

All variables are optional; settings are read from `demos/.env` if present
(`server.ts:6`), otherwise the defaults above apply.

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
   npm run dev     # node --watch server.ts → http://localhost:5175
   ```
   or `npm start` for a single run (`node server.ts`).

## Use it

1. Register an email/password.
2. Log in — the page flips to "signed in" and shows the decoded token.
3. Fetch `/api/me`, list sessions and revoke one, refresh the token, log out.

## Troubleshooting

- **`11000 duplicate key … tenantId/phone`** on a pre-existing dev database:
  stale non-partial indexes from an older schema are present. Drop them once:
  `db.users.dropIndex('tenantId_1_phone_1'); db.users.dropIndex('tenantId_1_email_1')`.
- **Login returns `mfaRequired: true`** — the password was accepted but the
  account has TOTP enrolled; the basic-auth demo stops here by design. The
  `mfa-demo` shows the full challenge/verify flow.
- **`MISSING_FIELDS`** — both `email` and `password` are required.
- **CORS** — the SPA is served same-origin by this Express app
  (`express.static`), so no CORS is involved. A UI hosted on another origin
  would need to be added to the identity-server's `PEZHWAN_ALLOWED_ORIGINS`
  (default allowlist: `localhost:4011`, `localhost:5173`, `127.0.0.1:5500`).