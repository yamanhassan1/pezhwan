# @pezhwan/express

Express middleware + routers for PEZHWAN.

## Install

```bash
npm install @pezhwan/express @pezhwan/core
```

## Quick start

```ts
import express from 'express';
import { createPezhwan } from '@pezhwan/core';
import {
  createAuthenticate,
  buildRouters,
  jwksHandler,
  requestContext,
} from '@pezhwan/express';

const runtime = createPezhwan({ issuer: 'https://id.example.com' });

const app = express();
app.use(express.json());
app.use(requestContext(runtime));

app.get('/.well-known/jwks.json', jwksHandler(runtime));
app.use('/v1/auth', buildRouters(runtime).auth);
app.use('/v1/sessions', buildRouters(runtime).sessions);

app.use('/v1/protected', createAuthenticate(runtime), requireRole('ADMIN'));
```

## Surface

- **Identity** — `createAuthenticate`, `requireAuth`, `requireRole`, `requirePermission`, `jwksHandler`, `extractToken`
- **Routers** — `buildRouters` (auth, sessions, oauth, mfa, verification) plus per-domain `create*Router` factories under `src/routes/` (admin, compliance, developer, graphql, scim, subscription, team, webhook)
- **Rate limiting** — `rateLimit` (kebab mirror: `rate-limit`)
- **API keys** — `createAuthenticateApiKey`, `requireApiKey`, `extractApiKey`
- **Security** — `requestContext`, `corsAllowlist` (see `src/security.ts`)
- **WebSocket** — `attachWebSocketServer` (see `src/websocket/`)

## Error envelopes

All successful responses use `{ success: true, data }`. Domain routers whose
backing subsystem is not part of the core engine (graphql, scim, subscription,
team, webhook) answer `503 { code: 'FEATURE_NOT_ENABLED' }` — the contract
exists, and it fails loudly rather than fabricating data.