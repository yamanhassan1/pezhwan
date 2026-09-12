# PEZHWAN · Passkey Demo

Passwordless sign-in with FIDO2/WebAuthn passkeys using `WebAuthnService`.
Register a passkey on your account, then authenticate with nothing but a
fingerprint, face, or PIN — the browser prompts for a ceremony against the
relying-party identity `localhost:5178`.

## What this demo shows

- Password register/login as a fallback bootstrap path.
- `webauthn.beginRegistration` / `completeRegistration` — the WebAuthn
  **registration** ceremony (`navigator.credentials.create` on the client).
- `webauthn.beginAuthentication` / `completeAuthentication` — the
  **authentication** ceremony (`navigator.credentials.get`).
- `webauthn.listCredentials` — passkeys attached to the signed-in user.
- After a successful assertion the server opens a session and signs an access
  token with `authMethod: 'passkey'` (`server.ts:261`), exactly like any other
  auth method.
- `removeCredentials`-style revocation is left out deliberately — see
  `listCredentials` output for what a revocation UI would iterate over.

## Key files

| File | Role |
|------|------|
| `server.ts` | Express app: runtime, durable keys, `WebAuthnService`, ceremony + account routes |
| `index.html` | SPA — register, password login, passkey register/authenticate, token inspector |
| `keys/` | Durable signing keys created on first boot by `initKeyPersistence` |

### API surface (`server.ts`)

- `POST /api/register`, `POST /api/login` — password bootstrap.
- `GET /api/me` (auth) — identity + list of the user's passkeys.
- `POST /api/passkey/register/begin` (auth) / `.complete` — registration.
- `POST /api/passkey/assert/begin` / `.complete` — authentication.

## Required configuration

**Self-contained.** The demo embeds `@pezhwan/core` and connects directly to
MongoDB — it does *not* call the identity-server. `ISSUER` defaults to
`http://localhost:4011` purely to stamp the same `iss` claim the identity-server
uses, so tokens share the same contract.

The `WebAuthnService` is configured in `server.ts:53` with `rpId: 'localhost'`,
`origins: ['http://localhost:5178']`, `requireUserVerification: false`,
`attestation: 'none'`. These must match the origin you actually open in the
browser.

| Environment variable | Default | Purpose |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/pezhwan` | Shared database |
| `PORT` | `5178` | HTTP listen port |
| `TENANT_ID` | `dev-tenant` | Tenant the demo runs as |
| `APPLICATION_ID` | `dev-app` | Application within the tenant |
| `ISSUER` | `http://localhost:4011` | JWT `iss` claim |

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
   npm run dev     # node --watch server.ts → http://localhost:5178
   ```
   or `npm start` for a single run (`node server.ts`).

## Use it

1. Register an account (or log in with the password fallback).
2. In "Your account", click **Register passkey** — the browser prompts for a
   fingerprint, face, or PIN. The passkey now appears in `listCredentials`.
3. Log out. Under "Sign in with a passkey", enter the email and click
   **Authenticate** — confirm the browser prompt and you are signed in.

## Troubleshooting

- **HTTPS / secure context** — `navigator.credentials` only runs in a *secure
  context*. `http://localhost` is exempt, so the demo works as-is on
  `http://localhost:5178`. Opening it via a LAN IP (`http://192.168.x.x:5178`)
  or a raw IP will not prompt — use `localhost` or serve the demo over HTTPS.
- **`origins` / `rpId` mismatch** — the `origins` array in `server.ts:56` and
  the demo's `rpId` (`localhost`) must match the browser's
  `window.location.origin`; change them together if you move ports.
- **Passkey not offered at sign-in** — the email must match a user that has at
  least one registered passkey.
- **Registering from a fresh browser** — a passkey is bound to the browser's
  platform authenticator; recreate one if the browser/OS can't find the
  credential.