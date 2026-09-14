# PEZHWAN · MFA Demo

TOTP (Google Authenticator / RFC 6238) multi-factor authentication with
`MfaService`: enroll (scan QR URI), verify, enable, disable, and complete a
login that has been challenged on the second factor.

## What this demo shows

- `auth.register` / `auth.loginPassword` — password login that returns
  `mfaRequired: true` when the account has TOTP enabled.
- `auth.verifyMfaLogin` — finishes the challenged login after a 6-digit code.
- `runtime.mfa.beginSetup` — returns `{ secret, otpauthUri, backupCodes }`.
- `runtime.mfa.enable` / `.disable` — enroll and remove TOTP (disable requires
  a current TOTP code).
- `runtime.mfa.isEnabled` — surfaced on `/api/me`.
- At-rest secrecy: the TOTP secret is stored encrypted with
  `MFA_ENCRYPTION_KEY` (AES-256-GCM); backup codes are stored hashed.

## Key files

| File         | Role                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| `server.ts`  | Express app: runtime, durable keys, MFA enrollment + login-completion routes |
| `index.html` | SPA — register/login, TOTP step-up prompt, setup/verify/disable panel        |
| `keys/`      | Durable signing keys created on first boot by `initKeyPersistence`           |

### API surface (`server.ts`)

- `POST /api/register`, `POST /api/login` — first factor.
- `POST /api/mfa/complete-login` — `verifyMfaLogin` for a challenged login.
- `POST /api/mfa/setup` (auth) — begin TOTP enrollment.
- `POST /api/mfa/enable` (auth) — confirm with a TOTP code.
- `GET /api/mfa/status` (auth), `POST /api/mfa/disable` (auth).
- `GET /api/me` (auth) — profile + `mfaEnabled`.

## Required configuration

**Self-contained.** The demo embeds `@pezhwan/core` and connects directly to
MongoDB — it does _not_ call the identity-server. `ISSUER` defaults to
`http://localhost:4011` purely to stamp the same `iss` claim the identity-server
uses, so tokens share the same contract.

| Environment variable | Default                             | Purpose                                                                                         |
| -------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| `MONGODB_URI`        | `mongodb://localhost:27017/pezhwan` | Shared database                                                                                 |
| `PORT`               | `5177`                              | HTTP listen port                                                                                |
| `TENANT_ID`          | `dev-tenant`                        | Tenant the demo runs as                                                                         |
| `APPLICATION_ID`     | `dev-app`                           | Application within the tenant                                                                   |
| `ISSUER`             | `http://localhost:4011`             | JWT `iss` claim                                                                                 |
| `MFA_ENCRYPTION_KEY` | 32-byte base64 default              | AES-256-GCM key — **must** decode to exactly 32 bytes or `INVALID_MFA_ENCRYPTION_KEY` is thrown |

## Run it

Prerequisites: Node.js **>= 24** (demos run TypeScript directly via type
stripping) and a local MongoDB (`mongodb://localhost:27017`).

1. From the repo root, install and build the workspace packages once:
   ```bash
   npm install
   npm run build
   ```
2. _Full-stack context only — not required._ Start the identity-server on 4011:
   ```bash
   npm run dev -w @pezhwan/identity-server
   ```
   The demo runs fine without it.
3. From this directory:
   ```bash
   npm run dev     # node --watch server.ts → http://localhost:5177
   ```
   or `npm start` for a single run (`node server.ts`).

## Use it

1. Register a fresh account (an account that already has TOTP from another
   demo will hit the MFA gate when you log in).
2. Log in → sign in. In "Enable MFA", click **Begin setup** and scan the
   provisioning URI with Google Authenticator (or any TOTP app), or enter the
   Base32 secret manually. Save the backup codes.
3. Enter a code and click **Enable MFA**.
4. Log out, then log in again — this time login returns `mfaRequired`, and the
   "Enter TOTP Code" step appears. Complete it to sign in.
5. To disable, supply a current TOTP code under "Disable MFA".

## Troubleshooting

- **`INVALID_MFA_ENCRYPTION_KEY`** — the `MFA_ENCRYPTION_KEY` you set does not
  decode to exactly 32 bytes. Stick to the default or use a proper base64
  32-byte value.
- **TOTP code rejected** — check your device's clock skew (TOTP uses 30-second
  windows); re-scan the URI in your authenticator app.
- **MFA flow on a pre-existing DB** — a user who enabled TOTP via an earlier
  run is challenged at login; that is expected behavior.
- **Stale indexes → `11000 duplicate key`** — drop them per `demos/README.md`.
- **CORS** — the SPA is served same-origin by this Express app; no CORS setup
  is needed unless the UI is hosted on another origin.
