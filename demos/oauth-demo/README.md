# PEZHWAN · OAuth 2.0 Demo

An end-to-end **Authorization Code + PKCE** flow using `OAuthService`: register
a public client, authorize with a signed-in user, exchange the single-use code
(S256 verifier kept server-side), and rotate the refresh token.

## What this demo shows

- `runtime.oauth.registerClient` — `/api/bootstrap` creates the public
  **"Demo Web Client"** (confidential: false, redirect
  `http://localhost:5180/callback`, grants `authorization_code` +
  `refresh_token`, scopes `openid profile email`).
- `runtime.oauth.authorizeCode` — issues a single-use authorization code with
  a server-generated PKCE `code_verifier`/`code_challenge` (S256). The SPA
  never sees the verifier.
- A **real browser redirect** to `/callback?code=…&state=…` (`index.html:275`).
- `runtime.oauth.exchange` — code→tokens, then `refresh_token` rotation.
- `OAuthClientModel` — `GET /api/clients` lists registered clients.
- `GET /api/me` validates the OAuth access token via `createAuthenticate`.

## Key files

| File         | Role                                                                                       |
| ------------ | ------------------------------------------------------------------------------------------ |
| `server.ts`  | Express app: runtime, durable keys, client bootstrap, authorize/exchange/refresh routes    |
| `index.html` | SPA — user session, client fetch, authorize redirect, token display, token validate/rotate |
| `keys/`      | Durable signing keys created on first boot by `initKeyPersistence`                         |

### API surface (`server.ts`)

- `GET /api/bootstrap` — find-or-create the demo client, return `clientId`.
- `POST /api/oauth/authorize` (auth) — produce `authorizationUrl` for redirect.
- `GET /callback` — SPA entry; the browser lands here with `code` + `state`.
- `POST /api/oauth/token` — `exchange` with the stored code verifier.
- `POST /api/oauth/refresh` — refresh-token rotation.
- `GET /api/clients`, `GET /api/me`.

## Required configuration

**Self-contained.** The demo embeds `@pezhwan/core` and connects directly to
MongoDB — it does _not_ call the identity-server. `ISSUER` defaults to
`http://localhost:4011` purely to stamp the same `iss` claim the identity-server
uses, so tokens share the same contract.

| Environment variable | Default                             | Purpose                       |
| -------------------- | ----------------------------------- | ----------------------------- |
| `MONGODB_URI`        | `mongodb://localhost:27017/pezhwan` | Shared database               |
| `PORT`               | `5180`                              | HTTP listen port              |
| `TENANT_ID`          | `dev-tenant`                        | Tenant the demo runs as       |
| `APPLICATION_ID`     | `dev-app`                           | Application within the tenant |
| `ISSUER`             | `http://localhost:4011`             | JWT `iss` claim               |

**OAuth redirect URI** — the client is registered with
`http://localhost:5180/callback`. The same literal value is hard-coded in
`server.ts:123/129/151/177` (bootstrap, authorize, exchange). If you change
`PORT`, update all of them together and delete the existing "Demo Web Client"
document so `/api/bootstrap` re-creates it with the new redirect.

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
   npm run dev     # node --watch server.ts → http://localhost:5180
   ```
   or `npm start` for a single run (`node server.ts`).

## Use it

1. Register or log in with the email/password form (opens a user session).
2. Click **Fetch demo client** to create/provision the client and see the
   registry table.
3. Click **Authorize now** — the browser is redirected through
   `/callback?code=…&state=…`; the SPA exchanges the code and displays the
   OAuth access/refresh tokens.
4. **Validate token** against `/api/me`, then **Rotate refresh token**.

## Troubleshooting

- **`UNKNOWN_STATE`** — the one-time `state` was not found in the in-memory
  `pending` map (page reloaded between authorize and exchange, or a second
  page). Re-authorize.
- **Redirect URI mismatch** — an `invalid_redirect_uri` style failure means the
  `redirectUri` argument differs from the client's registered redirect URI;
  see "OAuth redirect URI" above.
- **`MFA_REQUIRED`** — the demo login path (`server.ts:108`) rejects accounts
  with MFA enabled; register a fresh account for this demo.
- **CORS** — all requests stay same-origin on `localhost:5180`; only a
  cross-origin UI would need allow-listing on the server.
