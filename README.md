# PEZHWAN — One Identity. Every Application. (پېژوان)

Pezhwan is a security-first identity and access management SDK for modern web applications. It provides registration, login, sessions, MFA, RBAC, OAuth/OIDC primitives, and token lifecycle handling across multiple programming languages and frameworks.

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

### Core Packages

| Package                    | Purpose                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `@pezhwan/shared`          | Shared types, constants, and error definitions                      |
| `@pezhwan/crypto`          | Key generation, Argon2id, JWT signing, OTP/TOTP, encryption helpers |
| `@pezhwan/oauth`           | OAuth/OIDC flows and PKCE helpers                                   |
| `@pezhwan/core`            | Runtime, auth engine, domain models, sessions, rate limiting, RBAC  |

### Node.js & JavaScript Packages

| Package                    | Purpose                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `@pezhwan/node`            | Node.js SDK facade                                                  |
| `@pezhwan/express`         | Express middleware, auth middleware, routers, security helpers      |
| `@pezhwan/react`           | Browser auth provider and route guards                              |
| `@pezhwan/angular`         | Angular authentication module and route guards                      |
| `@pezhwan/vue`             | Vue.js composables and authentication provider                      |
| `@pezhwan/cli`             | Command-line tools for Pezhwan management and operations            |

### Backend Packages

| Package                    | Purpose                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `@pezhwan/go`              | Go SDK for server-side authentication                                |
| `@pezhwan/java`            | Java SDK for enterprise applications                                 |
| `@pezhwan/dotnet`          | .NET SDK for C# and ASP.NET applications                             |
| `@pezhwan/python`          | Python SDK for Django, FastAPI, and other frameworks                |

### Reference Implementation

| Package                    | Purpose                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `@pezhwan/identity-server` | Reference identity server used for local dev and demos              |

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
import {
  buildRouters,
  requireAuth,
  requireRole,
  csrfProtection,
  corsAllowlist,
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
app.use('/v1/auth', routers.auth);
app.get('/v1/admin/health', requireAuth(), requireRole('ADMIN'), (_req, res) => {
  res.json({ ok: true });
});
```

### React integration

```tsx
import { PezhwanProvider, useAuth } from '@pezhwan/react';

function App() {
  return (
    <PezhwanProvider
      issuer="http://localhost:4011"
      clientId="dev-app"
      redirectUri="http://localhost:3000/callback"
    >
      <Dashboard />
    </PezhwanProvider>
  );
}

function Dashboard() {
  const { user, login, logout } = useAuth();
  
  if (!user) {
    return <button onClick={() => login()}>Log in</button>;
  }
  
  return (
    <div>
      <p>Welcome, {user.email}</p>
      <button onClick={() => logout()}>Log out</button>
    </div>
  );
}
```

### Browser auth flow

For browser clients, prefer secure cookie-based authentication and keep tokens off the page whenever possible. The demo in `demos/browser-sdk/index.html` is intentionally a development-only example.

### Go integration

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

### Java integration

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

### Python integration

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

## Supported languages and frameworks

Pezhwan SDKs support the following languages and frameworks:

- **JavaScript/TypeScript**: Node.js, Express, React, Angular, Vue, CLI
- **Go**: Standard library and popular frameworks
- **Java**: Spring Boot, Jakarta EE, and standard Java
- **Python**: Django, FastAPI, and WSGI-compatible frameworks
- **.NET**: ASP.NET Core, C#
- **Browser**: Vanilla JS, React, Angular, Vue with secure cookie-based auth

## Documentation

Additional project documentation lives in `docs/`:

- `docs/ARCHITECTURE.md` — architecture and package relationships
- `docs/OPENAPI.yaml` — HTTP surface for the reference server
- `docs/THREAT-MODEL.md` — STRIDE-based threat model
- `docs/security-audit.md` — security review notes and remediation tracking
- `docs/PHASE-A.md`, `docs/PHASE-B.md`, `docs/PHASE-C.md` — milestone and engineering notes

## Status

This repository is a development and reference implementation. It is intended for local evaluation, testing, and extension, not as a production deployment without additional hardening, secret management, and compliance verification.
