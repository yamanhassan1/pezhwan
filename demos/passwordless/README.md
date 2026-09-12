# PEZHWAN · Passwordless Demo

Magic-link sign-in with a simulated inbox — auth works entirely without
passwords, using `AuthService.sendMagicLink` / `redeemMagicLink`. The "email"
the user would click is printed to the server console as a one-time token and
pasted into the UI.

## What this demo shows

- One-time registration (the single password-using step — a magic-link sign-in
  needs an existing account).
- `auth.sendMagicLink` — issues a short-lived (default 900 s) one-time token.
- `auth.redeemMagicLink` — exchanges the token for new access + refresh tokens
  and a session.
- **Address-enumeration protection** — the API answers `sent: true`
  identically for unknown emails; unknown accounts get a *decoy* token that can
  never be redeemed.
- `/api/me` behind `createAuthenticate` + `requireAuth`.

## Key files

| File | Role |
|------|------|
| `server.ts` | Express app: runtime, durable signing keys, magic-link + register + `/api/me` routes |
| `index.html` | SPA with three steps: register, "send magic link", "sign in with the token" |
| `keys/` | Durable signing keys created on first boot by `initKeyPersistence` |

### API surface (`server.ts`)

- `POST /api/register` — bootstrap account (email + password, used once).
- `POST /api/magic/send` — `sendMagicLink`; the token is logged to the server
  console (`server.ts:107`), never emailed.
- `POST /api/magic/redeem` — `redeemMagicLink`; returns the user + tokens.
- `GET /api/me` — the signed-in profile.

## Required configuration

**Self-contained.** The demo embeds `@pezhwan/core` and connects directly to
MongoDB — it does *not* call the identity-server. `ISSUER` defaults to
`http://localhost:4011` purely to stamp the same `iss` claim the identity-server
uses, so tokens share the same contract.

| Environment variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/pezhwan` | Shared database |
| `PORT` | `5176` | HTTP listen port |
| `TENANT_ID` | `dev-tenant` | Tenant the demo runs as |
| `APPLICATION_ID` | `dev-app` | Application within the tenant |
| `ISSUER` | `http://localhost:4011` | JWT `iss` claim |

Settings are read from `demos/.env` if present (`server.ts:6`), otherwise the
defaults above apply. With a real provider you would configure SMTP/SendGrid in
place of the console `otpDelivery` handler.

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
   npm run dev     # node --watch server.ts → http://localhost:5176
   ```
   or `npm start` for a single run (`node server.ts`).

## Use it

1. Register an email + password (one-time bootstrap).
2. Enter that email in step 1 and click **Send magic link**.
3. Look in the **server console** window for the `TOKEN` line.
4. Paste the token into step 2, click **Sign in** — you are authenticated.

## Troubleshooting

- **No token in the console** — the demo's simulated inbox is the stdout of the
  terminal running `npm run dev`; make sure you are watching that window.
- **`Invalid or expired magic link`** — tokens are single-use and short-lived
  (~900 s default, `expiresIn` in the send response). Send a fresh link.
- **Unknown email never signs in** — by design the server issues a decoy token
  so it cannot be enumerated; use an account you registered.
- **`11000 duplicate key …`** — stale non-partial indexes on a pre-existing DB;
  drop the old indexes as described in `demos/README.md`.
- **CORS** — the SPA is served same-origin by this Express app, so no CORS is
  involved unless the UI is hosted on a different origin.