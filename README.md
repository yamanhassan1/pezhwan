# PEZHWAN — One Identity. Every Application. (پېژوان)

Pezhwan is a security-first identity and access management SDK for modern web applications. It provides registration, login, sessions, MFA, RBAC, OAuth/OIDC primitives, and token lifecycle handling in a single server-side abstraction.

The core idea is simple: applications integrate Pezhwan once and never reimplement authentication logic themselves.

```
Application
    ↓
Pezhwan SDK (auth / session / authorization)
    ↓
MongoDB + Redis + security services
```

## What Pezhwan includes

- Password-based registration and login
- Email and phone account flows
- MFA / OTP / TOTP support
- Session management and refresh-token rotation
- Role-based authorization and permission checks
- OAuth 2.1 / OIDC primitives and JWKS endpoints
- Audit logging and security telemetry
- Identity-server reference implementation for local development

## Monorepo layout

| Package | Purpose |
| --- | --- |
| `@pezhwan/shared` | Shared types, constants, and error definitions |
| `@pezhwan/crypto` | Key generation, Argon2id, JWT signing, OTP/TOTP, encryption helpers |
| `@pezhwan/oauth` | OAuth/OIDC flows and PKCE helpers |
| `@pezhwan/core` | Runtime, auth engine, domain models, sessions, rate limiting, RBAC |
| `@pezhwan/node` | Node.js SDK facade |
| `@pezhwan/express` | Express middleware, auth middleware, routers, security helpers |
| `@pezhwan/react` | Browser auth provider and route guards |
| `@pezhwan/identity-server` | Reference identity server used for local dev and demos |

## Quick start

```bash
npm install
cp .env.example .env
npm run build
```

Then start the identity server from the repo root:

```bash
npm run dev -w @pezhwan/identity-server
```

The local server runs on `http://localhost:4011` by default.

## SDK usage

### Node.js server-side usage

```ts
import { Pezhwan } from '@pezhwan/node';

const pezhwan = Pezhwan({
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'http://localhost:4011',
  audience: 'pezhwan.clients',
  otpDelivery: {
    sendEmail: async (to, code) => {
      console.log(`OTP for ${to}: ${code}`);
    },
    sendSms: async (to, code) => {
      console.log(`SMS OTP for ${to}: ${code}`);
    },
  },
});

const demoPassword = 'replace-me';

const registerResult = await pezhwan.auth.register({
  email: 'user@example.com',
  password: demoPassword,
});

const loginResult = await pezhwan.auth.loginPassword({
  email: 'user@example.com',
  password: demoPassword,
});

const accessToken = loginResult.tokens.accessToken;
const refreshToken = loginResult.tokens.refreshToken;

await pezhwan.authorization.assignRole({
  userId: registerResult.user.id,
  roleName: 'ADMIN',
});
```

### Express integration

```ts
import express from 'express';
import { buildRouters, requireAuth, requireRole, csrfProtection, corsAllowlist } from '@pezhwan/express';
import { createPezhwan } from '@pezhwan/core';

const runtime = createPezhwan({
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'http://localhost:4011',
  audience: 'pezhwan.clients',
});

const app = express();
const routers = buildRouters(runtime);

app.use(express.json());
app.use(corsAllowlist({ allowedOrigins: ['http://localhost:3000'] }));
app.use(csrfProtection());
app.use('/v1/auth', routers.auth);
app.get('/v1/admin/health', requireAuth(), requireRole('ADMIN'), (_req, res) => {
  res.json({ ok: true });
});
```

### Browser auth flow

For browser clients, prefer secure cookie-based authentication and keep tokens off the page whenever possible. The demo in `demo/index.html` is intentionally a development-only example and should not be used as a production reference for token handling.

## Configuration

The identity server validates all environment variables through `apps/identity-server/src/config/env.ts` using Zod.

Typical local values include:

```bash
PEZHWAN_ISSUER=http://localhost:4011
PEZHWAN_TENANT_ID=dev-tenant
PEZHWAN_APPLICATION_ID=dev-app
PEZHWAN_MONGODB_URI=mongodb://localhost:27017/pezhwan
PEZHWAN_REDIS_URL=redis://localhost:6379
PEZHWAN_ALLOWED_ORIGINS=http://localhost:4011,http://127.0.0.1:4011,http://localhost:5173
```

The repo includes `.env.example` as the safe template for local development.

## Security model

Pezhwan follows a fail-closed design and assumes clients are untrusted.

Core protections include:

- Argon2id password hashing
- RS256/ES256/EdDSA signing with JWKS publishing
- Short-lived access tokens and rotating refresh tokens
- Token reuse detection and family revocation
- Session invalidation and replay prevention
- RBAC checks enforced server-side
- Strict CORS allowlists and CSRF double-submit cookies
- Tenant/application boundary enforcement across auth, sessions, and OAuth
  (`SESSION_CONTEXT_INVALID` on a context mismatch; `INVALID_SCOPE` on
  out-of-scope OAuth requests)
- Request correlation IDs and audit logging
- Secret scanning and local security checks

Important:

- Never store production secrets in source control
- Never expose refresh tokens or bearer tokens in frontend JavaScript in production
- Treat the browser as untrusted territory; all policy decisions must be enforced on the server

## Documentation

Additional project documentation lives in `docs/`:

- `docs/ARCHITECTURE.md` — architecture and package relationships
- `docs/OPENAPI.yaml` — HTTP surface for the reference server
- `docs/THREAT-MODEL.md` — STRIDE-based threat model
- `docs/security-audit.md` — security review notes and remediation tracking
- `docs/PHASE-A.md`, `docs/PHASE-B.md`, `docs/PHASE-C.md` — milestone and engineering notes

## Status

This repository is a development and reference implementation. It is intended for local evaluation, testing, and extension, not as a production deployment without additional hardening, secret management, and infrastructure controls.
