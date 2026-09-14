# PEZHWAN — One Identity. Every Application. (پېژوان)

Pezhwan is a **universal Identity & Access Management (IAM) SDK** built as a
modular npm-workspaces monorepo. Integrate authentication, session management,
MFA, RBAC/ABAC authorization, OAuth/OIDC federation, and token lifecycle
handling in a single abstraction — and never re-implement auth logic yourself.

```
┌─────────────────────── Applications ───────────────────────┐
│  identity-server · admin-console · developer-portal        │
├────────────────────── SDK layer ───────────────────────────┤
│  react · angular · vue · node · express · cli              │
│  python · go · java · dotnet                               │
├────────────────────── Core ────────────────────────────────┤
│  @pezhwan/core — auth engine · models · middleware · plugs │
├────────────────────── Support ─────────────────────────────┤
│  shared · crypto · oauth · infrastructure                  │
└────────────────────────────────────────────────────────────┘
                  │
           MongoDB 7  ·  Redis 7 (optional)
```

## Features

| Area                     | What you get                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Registration & login** | Email/password, phone number, OTP, passwordless magic link                                                |
| **Session management**   | Rotating refresh tokens with single-use enforcement; reuse detection triggers automatic family revocation |
| **MFA / TOTP**           | Authenticator enrolment, MFA-gated logins, backup codes, disable flow                                     |
| **RBAC & ABAC**          | Role-based and attribute-based authorization; deny-by-default server-side                                 |
| **OAuth 2.1 + OIDC**     | Authorization code with PKCE, client registration, discovery, JWKs                                        |
| **Federation**           | Google, GitHub, Microsoft, Apple, Facebook, custom SAML/OIDC providers                                    |
| **SCIM 2.0**             | Provisioning endpoint for enterprise IdP integration                                                      |
| **WebAuthn / Passkeys**  | Registration and authentication against hardware biometric keys                                           |
| **Audit logging**        | Tamper-evident, per-tenant audit trail with correlation IDs                                               |
| **Rate limiting**        | Configurable per-route budgets (login, OTP, API, MFA)                                                     |
| **Webhooks**             | Outbound event delivery with HMAC signatures and retry                                                    |
| **Event sourcing**       | Domain events, projections, job queues                                                                    |
| **Compliance helpers**   | GDPR, HIPAA, CCPA, PCI-DSS, SOC 2 reference hooks                                                         |
| **Multi-tenancy**        | Hard tenant + application boundary on every query, token, and session                                     |
| **Observability**        | Structured logging, Prometheus metrics, OpenTelemetry tracing                                             |

---

## Repository layout

### TypeScript packages (`packages/`)

| Package            | Purpose                                                                                                                | Docs                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `@pezhwan/shared`  | Framework-independent contracts: types, errors, constants, validators                                                  | [packages/shared/README.md](./packages/shared/README.md)   |
| `@pezhwan/crypto`  | Argon2id, RS256/ES256/EdDSA JWT, TOTP/OTP, AES-GCM, WebAuthn, key store                                                | [packages/crypto/README.md](./packages/crypto/README.md)   |
| `@pezhwan/oauth`   | OAuth 2.1 / OIDC providers, PKCE, federation (SAML/OIDC), SCIM                                                         | [packages/oauth/README.md](./packages/oauth/README.md)     |
| `@pezhwan/core`    | Runtime, auth engine, 25 Mongoose models, 13 middleware helpers, adapters                                              | [packages/core/README.md](./packages/core/README.md)       |
| `@pezhwan/node`    | Node.js SDK facade — typed runtime client, error classes, re-exports                                                   | [packages/node/README.md](./packages/node/README.md)       |
| `@pezhwan/express` | Express middleware, routers (auth/sessions/OAuth/MFA/SCIM/webhooks/…), API-key auth                                    | [packages/express/README.md](./packages/express/README.md) |
| `@pezhwan/react`   | React provider + hooks: `useAuth`, `useMFA`, `useSession`, `useTenant`, `usePasswordless`, `useWebAuthn`               | [packages/react/README.md](./packages/react/README.md)     |
| `@pezhwan/vue`     | Vue composable: `useAuth`, `useMFA`, `useSession`, plugin bootstrap                                                    | [packages/vue/README.md](./packages/vue/README.md)         |
| `@pezhwan/angular` | Angular services: `AuthService`, `SessionService`, `MfaService`, guards                                                | [packages/angular/README.md](./packages/angular/README.md) |
| `@pezhwan/cli`     | `pezhwan` CLI — health, auth, users, sessions, clients, roles, tenants, audit, keys, migrate, backup, config, webhooks | [packages/cli/README.md](./packages/cli/README.md)         |

### Non-TypeScript SDK clients

| Client    | Language | Docs                                                     |
| --------- | -------- | -------------------------------------------------------- |
| `pezhwan` | Python   | [packages/python/README.md](./packages/python/README.md) |
| `pezhwan` | Go       | [packages/go/README.md](./packages/go/README.md)         |
| `Pezhwan` | Java     | [packages/java/README.md](./packages/java/README.md)     |
| `Pezhwan` | .NET     | [packages/dotnet/README.md](./packages/dotnet/README.md) |

### Apps (`apps/`)

| App              | Workspace                  | Port | Description                            |
| ---------------- | -------------------------- | ---- | -------------------------------------- |
| Identity Server  | `@pezhwan/identity-server` | 4011 | Reference HTTP identity API            |
| Admin Console    | `pezhwan-admin-console`    | 5173 | Admin dashboard over `/v1/admin/*`     |
| Developer Portal | `pezhwan-developer-portal` | 5174 | API keys, webhooks, docs, API explorer |

### Demos (`demos/`)

Standalone Express + vanilla-JS examples, each backed by `@pezhwan/core`:

`basic-auth` · `passwordless` · `mfa-demo` · `passkeys` · `social-login` ·
`oauth-demo` · `multi-tenant` · `machine-to-machine`

---

## Requirements

| Tool    | Version    | Notes                                                                                                                                                                |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js | **≥ 23.6** | Dev scripts run TS directly (`node --watch src/server.ts`, `node --test`); native type-stripping requires 23.6+. Node 22.6+ works with `--experimental-strip-types`. |
| MongoDB | 7+         | Replica set required for multi-document transactions (refresh rotation, OAuth code redeem)                                                                           |
| Redis   | 7+         | Optional — rate limits, OTP state, session cache fall back to in-memory when absent                                                                                  |
| Docker  | (optional) | `npm run verify:compose` to validate the Compose stack; Docker Compose provides a full local replica set + Redis                                                     |

---

## Quick start

### 1. Install and build

```bash
npm install
cp .env.example apps/identity-server/.env   # server reads apps/identity-server/.env
npm run build
```

### 2. Seed the database

The seed script reads `process.env` directly — export the admin credentials in the
same shell so the bootstrap admin user is created:

```bash
export PEZHWAN_ADMIN_EMAIL='admin@pezhwan.local'
export PEZHWAN_ADMIN_PASSWORD='ChangeMe-123!'
npm run seed
```

### 3. Start the server (watch mode)

```bash
npm run dev -w @pezhwan/identity-server   # http://localhost:4011
```

**Alternatively — Docker Compose** (spins up Mongo replica set, Redis, and the
identity server in one command):

```bash
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

---

## Using the SDK

### Node.js (server-side)

```ts
import { Pezhwan } from '@pezhwan/node';

const runtime = Pezhwan({
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  issuer: 'http://localhost:4011',
  audience: 'pezhwan.clients',
  otpDelivery: {
    sendEmail: async (to, code) => {
      console.log(`OTP for ${to}: ${code}`);
    },
  },
});

// Register
const { user } = await runtime.auth.register({
  email: 'ada@example.com',
  password: 'Str0ng!Pass#2026',
});

// Login — returns tokens directly (or an MFA challenge when MFA is enabled)
const { tokens } = await runtime.auth.loginPassword({
  email: 'ada@example.com',
  password: 'Str0ng!Pass#2026',
});

// Assign a role
await runtime.authorization.assignRole({
  userId: user.id,
  tenantId: 'dev-tenant',
  applicationId: 'dev-app',
  roleName: 'ADMIN',
});
```

### Express integration

```ts
import express from 'express';
import {
  buildRouters,
  createAuthenticate,
  requireAuth,
  requireRole,
  corsAllowlist,
  csrfProtection,
} from '@pezhwan/express';
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
app.use(createAuthenticate(runtime));

// Mount the full auth surface
app.use('/v1/auth', routers.auth);
app.use('/v1/sessions', routers.sessions);
app.use('/v1/oauth', routers.oauth);
app.use('/v1/mfa', routers.mfa);
app.use('/v1/verify', routers.verification);

// Custom protected route
app.get('/v1/admin/health', requireAuth(), requireRole('ADMIN'), (_req, res) =>
  res.json({ ok: true }),
);
```

### React (browser)

```tsx
import { PezhwanProvider } from '@pezhwan/react';

<PezhwanProvider baseUrl="http://localhost:4011" tenantId="dev-tenant" applicationId="dev-app">
  {/* your app */}
</PezhwanProvider>;
```

Hooks: `useAuth`, `useMFA`, `useSession`, `useTenant`, `usePasswordless`,
`useWebAuthn`, `useSSO`, `useAuthorization`.

See the [React SDK README](./packages/react/README.md) and the demos in
`demos/basic-auth` for the full browser-auth pattern (CSRF cookie, token
storage, refresh).

For browser clients, prefer secure cookie-based authentication and keep tokens
off the page whenever possible. The demo in `demos/browser-sdk/index.html` is
intentionally a development-only example.

### Go

```go
package main

import (
  "github.com/yamanhassan1/pezhwan/packages/go"
)

func main() {
  client := pezhwan.NewClient(
    pezhwan.WithIssuer("http://localhost:4011"),
    pezhwan.WithTenantID("dev-tenant"),
    pezhwan.WithApplicationID("dev-app"),
  )

  // Register user
  user, err := client.Auth.Register(ctx, &pezhwan.RegisterRequest{
    Email:    "user@example.com",
    Password: "secure-password",
  })

  // Login
  tokens, err := client.Auth.LoginPassword(ctx, &pezhwan.LoginRequest{
    Email:    "user@example.com",
    Password: "secure-password",
  })
}
```

### Java

```java
import com.pezhwan.sdk.Pezhwan;
import com.pezhwan.sdk.auth.AuthService;

public class AuthApp {
  public static void main(String[] args) {
    Pezhwan pezhwan = Pezhwan.builder()
      .issuer("http://localhost:4011")
      .tenantId("dev-tenant")
      .applicationId("dev-app")
      .build();

    AuthService auth = pezhwan.getAuthService();

    // Register and login flow
    var user = auth.register("user@example.com", "password");
    var tokens = auth.loginPassword("user@example.com", "password");
  }
}
```

### Python

```python
from pezhwan import Pezhwan

pezhwan = Pezhwan(
    issuer="http://localhost:4011",
    tenant_id="dev-tenant",
    application_id="dev-app"
)

# Register
user = pezhwan.auth.register(
    email="user@example.com",
    password="secure-password"
)

# Login
tokens = pezhwan.auth.login_password(
    email="user@example.com",
    password="secure-password"
)
```

### CLI

```bash
npm exec pezhwan -- health          # connectivity check
npm exec pezhwan -- auth login \    # obtain a token
  --email admin@pezhwan.local \
  --password ChangeMe-123!
npm exec pezhwan -- sessions list   # active sessions
npm exec pezhwan -- users list      # tenant users
```

See the [CLI README](./packages/cli/README.md) for all 13 commands.

---

## Supported languages and frameworks

| Language / Platform | Packages / integrations                                       |
| ------------------- | ------------------------------------------------------------- |
| **JavaScript/TS**   | Node.js, Express, React, Angular, Vue, CLI                    |
| **Go**              | Standard library and popular frameworks                       |
| **Java**            | Spring Boot, Jakarta EE, and standard Java                    |
| **Python**          | Django, FastAPI, and WSGI-compatible frameworks               |
| **.NET**            | ASP.NET Core, C#                                              |
| **Browser**         | Vanilla JS, React, Angular, Vue with secure cookie-based auth |

---

## Configuration

The identity server validates all environment variables through
`apps/identity-server/src/config/env.ts` using Zod.

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

---

## Testing

The repo ships multiple test tiers, all using the Node.js built-in test runner
(`node --test`):

| Command                       | Scope                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run test:unit`           | Pure logic: auth, password policy, RBAC, OAuth, crypto, rate-limit, backstop invariants (no DB) |
| `npm run test:security-suite` | Attack simulations: brute force, CORS, CSRF, injection, token attacks, tenant escape            |
| `npm run test:integration`    | Real routers against `mongodb-memory-server`: full auth → refresh → logout, MFA, OAuth, SCIM    |
| `npm run test:interop`        | Third-party OAuth and SCIM interop (Google, GitHub, Microsoft, Okta, Azure)                     |
| `npm run test:root`           | Fast gate: unit + security + failure + interop (no DB)                                          |
| `npm test`                    | `npm run build` then every workspace's own test suite                                           |
| `npm run test:coverage`       | All suites with `--experimental-test-coverage`                                                  |

---

## Documentation

| Document                                            | Description                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)      | Architecture and design reference                                          |
| [docs/api/OPENAPI.yaml](./docs/api/OPENAPI.yaml)    | Authoritative HTTP API spec (OpenAPI 3.0.3)                                |
| [docs/THREAT-MODEL.md](./docs/THREAT-MODEL.md)      | STRIDE threat model per component                                          |
| [docs/security-audit.md](./docs/security-audit.md)  | Security review and remediation tracking                                   |
| [docs/developer/](./docs/developer/README.md)       | Developer guides (getting started, SDK dev, local dev, testing, debugging) |
| [docs/architecture/](./docs/architecture/README.md) | Architecture deep-dives (data flows, multi-tenancy, scaling, deployment)   |
| [docs/tutorials/](./docs/tutorials/README.md)       | Step-by-step runnable guides                                               |
| [CONTRIBUTING.md](./CONTRIBUTING.md)                | Contribution guide, code style, and PR workflow                            |
| [.github/SECURITY.md](./.github/SECURITY.md)        | Vulnerability reporting and security policy                                |
| [CHANGELOG.md](./CHANGELOG.md)                      | Release history                                                            |
| [docs/PHASE-A.md](./docs/PHASE-A.md)                | Phase A milestones (auth core)                                             |
| [docs/PHASE-B.md](./docs/PHASE-B.md)                | Phase B milestones (release hardening)                                     |
| [docs/PHASE-C.md](./docs/PHASE-C.md)                | Phase C milestones (production readiness)                                  |

The full docs index lives at [docs/README.md](./docs/README.md).

---

## Security model

Pezhwan follows a **fail-closed** design and assumes every client is untrusted:

- **Argon2id** password hashing (memory-hard, resistant to GPU brute force)
- **RS256** asymmetric JWTs with rotating key pairs and public JWKS distribution
- **15-minute access tokens**; rotating, single-use refresh tokens — reuse
  detection revokes the entire session family
- **Account state validation** on every request; if state cannot be verified
  (Mongo/Redis down), the server returns `503 SecurityDependencyError` — never
  a silent allow
- **Strict CORS allowlists** (exact origin match, no wildcard+credentials)
- **CSRF double-submit cookie** on every state-changing request
- **Tenant isolation** enforced on every token, session, role, and database query
- **RBAC + ABAC authorization** enforced server-side; never trust the browser
  for roles, permissions, or `tenantId`
- Security headers: CSP, HSTS, X-Frame-Options, referrer policy, permissions
  policy

Production deployments should additionally use TLS 1.3 termination, a WAF
(Cloudflare / AWS Shield), rate limiting at the edge, and managed secret storage
(KMS / HashiCorp Vault).

---

## Status

This repository is a development and reference implementation. It is intended
for local evaluation, testing, and extension, not as a production deployment
without additional hardening, secret management, and compliance verification.

---

## License

Proprietary — see [LICENSE](./LICENSE).
