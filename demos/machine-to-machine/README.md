# PEZHWAN · Machine-to-Machine Demo

Service-to-service authentication — no human involved. Two mechanism families
for the same protected services: **API keys** (`X-Api-Key` header, via
`runtime.apiKeys`) and **OAuth 2.0 `client_credentials`** service tokens (via
`runtime.oauth`).

## What this demo shows

- `runtime.apiKeys.create` — API key with scopes (default `machine.read`);
  the raw key is shown once (`server.ts:132`), only its hash is stored in Mongo.
- `runtime.apiKeys.revoke` — revoke a key by id.
- `runtime.oauth.registerClient` — a **confidential** client with grant
  `client_credentials` and scope `machine.read`.
- `runtime.oauth.exchange` — client credentials → access token.
- `runtime.tokens.verifyAccessToken` — server-side verification of the minted
  token (`server.ts:218`).
- Express auth middleware split:
  - `createAuthenticateApiKey` + `requireApiKey` — `GET /api/service/ping`
    (API key **only**).
  - Both API-key and Bearer middleware chained — `GET /api/service/status`
    accepts either.
  - `GET /health` — unauthenticated health probe.

## Key files

| File         | Role                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `server.ts`  | Express app: runtime, durable keys, key issue/revoke, client register, token exchange, protected services |
| `index.html` | SPA — create/revoke API key, register client, fetch token, call the service endpoints                     |
| `keys/`      | Durable signing keys created on first boot by `initKeyPersistence`                                        |

### API surface (`server.ts`)

- `POST /api/keys/create`, `GET /api/keys`, `POST /api/keys/:name/revoke`.
- `POST /api/oauth/register`, `POST /api/oauth/token`.
- `GET /api/service/ping` (API key), `GET /api/service/status` (key **or**
  bearer token), `GET /health`.

## Required configuration

**Self-contained.** The demo embeds `@pezhwan/core` and connects directly to
MongoDB — it does _not_ call the identity-server. `ISSUER` defaults to
`http://localhost:4011` purely to stamp the same `iss` claim the identity-server
uses, so tokens share the same contract.

| Environment variable | Default                             | Purpose                       |
| -------------------- | ----------------------------------- | ----------------------------- |
| `MONGODB_URI`        | `mongodb://localhost:27017/pezhwan` | Shared database               |
| `PORT`               | `5182`                              | HTTP listen port              |
| `TENANT_ID`          | `dev-tenant`                        | Tenant the demo runs as       |
| `APPLICATION_ID`     | `dev-app`                           | Application within the tenant |
| `ISSUER`             | `http://localhost:4011`             | JWT `iss` claim               |

OAuth `client_credentials` requires a **confidential** client (a secret is
issued); public clients are not usable for this grant.

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
   npm run dev     # node --watch server.ts → http://localhost:5182
   ```
   or `npm start` for a single run (`node server.ts`).

## Use it

1. **Create API Key** — copy the `rawKey` (shown once), then **Ping with API
   Key**. Ping with _no_ credentials to see the 401.
2. **Register Client** — a fresh confidential client is issued; client ID and
   secret auto-fill. **Get Token** to mint a `client_credentials` access token.
3. Call **Ping with Token** (Bearer) and **Status with Token** (key or token).

## Troubleshooting

- **Client secret lost** — secrets are shown once by design. Click **Register
  Client** again: the demo deletes the old "Demo Service Client" and issues a
  brand-new credential each time (`server.ts:177`).
- **`X-Api-Key` rejected after revoke** — revocation marks the key hash; the
  demo also drops it from its in-memory tracking list.
- **`client_credentials` only works for confidential clients** —
  `confidential: true` was set at registration; a public client has no secret
  to exchange.
- **CORS** — the SPA is served same-origin on `localhost:5182`; machine
  callers are typically non-browser (curl, services) and unaffected.
