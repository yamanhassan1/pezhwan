# PEZHWAN · Social Login Demo

"Sign in with Google" using `FederatedIdentityService` — but the Google IdP is
**simulated in-process** so the flow works with zero external credentials. It
walks the real OIDC shape (authorize → consent → callback → tokens), then shows
identity **linking** and **unlinking** against a password account.

## What this demo shows

- `FederatedIdentityService.resolve` — match an IdP subject to a local user,
  with `autoProvision: true` (accounts are created on first sign-in and get
  `emailVerified=true`).
- The simulated IdP: `GET /mock-idp/authorize` renders a Google-style consent
  form; `POST /mock-idp/consent` resolves the identity and redirects back to
  `/social/callback?token=…&refresh=…` (`server.ts:115`).
- `FederatedIdentityService.link` / `.unlink` — attach/detach a Google identity
  to/from an existing password account (`/api/link`, `/api/unlink`).
- Sessions + tokens minted with `runtime.sessions.create` and
  `runtime.tokens.signAccessToken`, `authMethod: 'oidc'`.
- Normal password register/login for the same tenant/application.

## Key files

| File | Role |
|------|------|
| `server.ts` | Express app: runtime, durable keys, mock IdP routes, federated link/unlink, callbacks |
| `index.html` | SPA — "Continue with Mock Google", password forms, profile + linked-identities panel |
| `keys/` | Durable signing keys created on first boot by `initKeyPersistence` |

### API surface (`server.ts`)

- `GET /mock-idp/authorize` → `POST /mock-idp/consent` → `GET /social/callback`.
- `POST /api/password/register` / `/api/password/login`.
- `GET /api/me` (auth) — email, `googleSubject`, `linked`.
- `POST /api/link` / `/api/unlink` (auth), `POST /api/logout` (auth).

The Google `subject` is the lower-cased email (`server.ts:85`), so linking
works with the same address you used at the mock IdP.

## Required configuration

**Self-contained.** The demo embeds `@pezhwan/core` and connects directly to
MongoDB — it does *not* call the identity-server. `ISSUER` defaults to
`http://localhost:4011` purely to stamp the same `iss` claim the identity-server
uses, so tokens share the same contract.

| Environment variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/pezhwan` | Shared database |
| `PORT` | `5179` | HTTP listen port |
| `TENANT_ID` | `dev-tenant` | Tenant the demo runs as |
| `APPLICATION_ID` | `dev-app` | Application within the tenant |
| `ISSUER` | `http://localhost:4011` | JWT `iss` claim |

With a *real* Google OAuth provider you would instead configure a client
ID/secret plus authorized redirect URI (`http://localhost:5179/social/callback`)
on the identity-server; this demo deliberately skips that so nothing external
is required.

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
   npm run dev     # node --watch server.ts → http://localhost:5179
   ```
   or `npm start` for a single run (`node server.ts`).

## Use it

1. Click **Continue with Mock Google** — the consent screen asks for a Google
   email; submit it. You are auto-provisioned and logged in.
2. Or register with email/password, then **Link Google to this account** using
   the same email — the profile panel shows `linked: true`.
3. Unlink, and log out to see the flow from the start.

## Troubleshooting

- **`IDENTITY_UNLINKED`** — `FederatedIdentityService.resolve` found no local
  user and auto-provision is off for that identity; keep `autoProvision: true`
  or register a password account for the same email first.
- **Callback arrives without tokens** — the mock IdP redirects with the
  `token`/`refresh` query params on `/social/callback`; a reload after
  `history.replaceState` clears them (that is by design).
- **Linking a foreign email** — link uses the lower-cased Google `subject`; the
  same address must be used to unlock it.
- **CORS** — the whole flow is same-origin on `localhost:5179`; a UI served
  elsewhere would need origin allow-listing on the server.