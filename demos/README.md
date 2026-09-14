# PEZHWAN Demos

End-to-end examples that connect directly to the PEZHWAN identity stack using the Node.js SDK (`@pezhwan/core`). Each demo is a standalone Express app with its own UI; they all connect to the same MongoDB, and each keeps its own durable signing keys so its JWTs stay valid across restarts.

## Quick start

1. Make sure MongoDB is running locally (default `mongodb://localhost:27017`).
2. Install the repo workspace once (from the repository root):
   ```bash
   npm install
   ```
3. Run any demo (each in its own terminal):
   ```bash
   cd demos/basic-auth && npm start
   ```

Demo dependencies are hoisted by the npm workspaces install at the repository
root — you only need to install once, from the root.

Each demo is self-contained: it reads `MONGODB_URI` (default `mongodb://localhost:27017/pezhwan`) and keeps its own durable signing keys under `demos/<name>/keys` (created on first boot). It runs standalone — no dependency on the identity server app.

## Demos

| Demo                 | Port | What it shows                                                          |
| -------------------- | ---- | ---------------------------------------------------------------------- |
| `basic-auth`         | 5175 | Email/password register, login, JWT viewer, refresh, logout            |
| `passwordless`       | 5176 | Magic-link email login (link logged to console in dev)                 |
| `mfa-demo`           | 5177 | TOTP setup (QR secret), verify, disable + login completion             |
| `passkeys`           | 5178 | WebAuthn passkey registration and authentication ceremony              |
| `social-login`       | 5179 | Simulated Google IdP with `FederatedIdentityService`                   |
| `oauth-demo`         | 5180 | OAuth 2.0 authorization code + PKCE flow end-to-end                    |
| `multi-tenant`       | 5181 | Tenant-scoped register/login, cross-tenant isolation                   |
| `machine-to-machine` | 5182 | API-key (`X-Api-Key`) auth + OAuth `client_credentials` service tokens |

> **Browser SDK demo (`demos/browser-sdk/`)** — not a standalone app. It is the
> single-file `index.html` the identity server serves at `/` (`express.static`
> in `apps/identity-server/src/server.ts`, baked into the Docker image). Load it
> from `http://localhost:4011/`, or open it directly on `127.0.0.1:5500` to
> exercise cross-origin CORS/CSRF handling.

## Architecture

Each demo's `server.ts`:

- Connects to the same MongoDB database as the other demos.
- Creates a `PezhwanRuntime` (default `tenantId` `dev-tenant`, `applicationId` `dev-app`, `issuer` `http://localhost:4011`).
- Adopts durable signing keys from its own `demos/<name>/keys` directory (`initKeyPersistence`) so JWTs stay valid across restarts.
- Instantiates only the SDK services needed for its feature (e.g., `WebAuthnService`, `MfaService`).
- Serves its own `index.html` (vanilla JS, no build step).

No proxy required — each demo is a self-contained SDK-backed micro-app.

## Environment

| Variable                       | Default                             | Purpose                                                     |
| ------------------------------ | ----------------------------------- | ----------------------------------------------------------- |
| `MONGODB_URI`                  | `mongodb://localhost:27017/pezhwan` | Shared Mongo                                                |
| `PORT`                         | (per-demo default)                  | Listen port                                                 |
| `TENANT_ID`                    | `dev-tenant`                        | Default tenant (not used by `multi-tenant`)                 |
| `APPLICATION_ID`               | `dev-app`                           | Default application (not used by `multi-tenant`)            |
| `ISSUER`                       | `http://localhost:4011`             | JWT issuer                                                  |
| `MFA_ENCRYPTION_KEY`           | per-demo default                    | 32-byte base64 encryption key for TOTP secrets (`mfa-demo`) |
| `TENANT_A_ID` / `TENANT_A_APP` | `dev-tenant` / `dev-app`            | Tenant A credentials (`multi-tenant` demo)                  |
| `TENANT_B_ID` / `TENANT_B_APP` | `tenant-b` / `app-b`                | Tenant B credentials (`multi-tenant` demo)                  |

> **First run on a pre-existing dev database:** if register returns
> `11000 duplicate key … tenantId/phone`, stale non-partial indexes from an
> older schema are still present. Drop them once:
> `db.users.dropIndex('tenantId_1_phone_1'); db.users.dropIndex('tenantId_1_email_1')`.
