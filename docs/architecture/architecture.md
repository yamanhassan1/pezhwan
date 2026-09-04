# PEZHWAN — Enterprise Architecture Design

## Architecture Overview

PEZHWAN is a **universal Identity & Access Management (IAM) SDK** built as a **modular monorepo** with strict package layering. The architecture follows **domain-driven design** principles with clear separation of concerns, enabling enterprise-grade security, scalability, and extensibility.

---

## 1. System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SYSTEMS                                  │
│                                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Browser    │  │  Mobile App  │  │  Backend API │  │  Third-Party     │   │
│  │   (React)    │  │  (iOS/Android)│  │  (Node.js)   │  │  IdPs (Google/  │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │  GitHub/Microsoft)│   │
│         │                 │                 │          └──────────┬──────────┘   │
└─────────┼─────────────────┼─────────────────┼─────────────────────┼──────────────┘
          │                 │                 │                     │
          ▼                 ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PEZHWAN IDENTITY SERVER                              │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         API GATEWAY LAYER                                 │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │   Express    │  │   GraphQL    │  │  WebSocket   │  │   gRPC       │ │ │
│  │  │   REST API   │  │  Federation  │  │   Server     │  │   Gateway    │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                      SECURITY MIDDLEWARE LAYER                            │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │ │
│  │  │   CORS   │ │   CSRF   │ │  Rate    │ │  Auth    │ │  Tenant  │       │ │
│  │  │          │ │          │ │  Limit   │ │  Middle  │ │  Middle  │       │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                         CORE ENGINE LAYER                                 │ │
│  │                                                                           │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │ │
│  │  │    Auth     │  │   Session   │  │  Authorization│  │     MFA/OTP    │ │ │
│  │  │   Engine    │  │   Manager   │  │   (RBAC/ABAC) │  │                │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │ │
│  │  │    OAuth/   │  │   Tenant/   │  │   Audit/    │  │   Event/        │ │ │
│  │  │    OIDC     │  │  Org/Team   │  │   Logging   │  │   Webhook       │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                      INFRASTRUCTURE LAYER                                 │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │   MongoDB    │  │    Redis     │  │    Key       │  │    HSM/      │ │ │
│  │  │   (Primary)  │  │   (Cache)    │  │   Store      │  │    KMS       │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Package Architecture (Dependency Graph)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            APPLICATION LAYER                                   │
│                                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────────┐ │
│  │  identity-      │  │  admin-console  │  │  developer-portal               │ │
│  │  server         │  │  (React Admin)  │  │  (React Developer)              │ │
│  └────────┬────────┘  └────────┬────────┘  └───────────────┬─────────────────┘ │
│           │                    │                           │                   │
│           └────────────────────┼───────────────────────────┘                   │
│                                ▼                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              SDK LAYER                                         │
│                                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │   react     │  │   angular   │  │    vue      │  │    node             │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
│         │                │                │                    │              │
│         └────────────────┼────────────────┼────────────────────┘              │
│                          │                │                                   │
│  ┌─────────────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌─────────────────────┐   │
│  │   express   │  │   python    │  │     go      │  │    java             │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘   │
│         │                │                │                    │              │
│         └────────────────┼────────────────┼────────────────────┘              │
│                          │                │                                   │
│  ┌─────────────┐  ┌──────┴──────┐  ┌──────┴──────┐  ┌─────────────────────┐   │
│  │   dotnet    │  │     cli     │  │  terraform  │  │   postman           │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CORE LAYER                                        │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │                              core                                         │ │
│  │                                                                           │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │ │
│  │  │  Services   │  │   Models    │  │ Middleware  │  │    Adapters     │ │ │
│  │  │             │  │             │  │             │  │                 │ │ │
│  │  │ • Auth      │  │ • User      │  │ • Auth      │  │ • Email         │ │ │
│  │  │ • Session   │  │ • Session   │  │ • Tenant    │  │ • SMS           │ │ │
│  │  │ • MFA       │  │ • Tenant    │  │ • RateLimit │  │ • Payment       │ │ │
│  │  │ • OAuth     │  │ • Role      │  │ • CSRF      │  │ • Storage       │ │ │
│  │  │ • RBAC/ABAC │  │ • OTP       │  │ • CORS      │  │ • IDP           │ │ │
│  │  │ • Audit     │  │ • Audit     │  │ • Security  │  │ • HSM           │ │ │
│  │  │ • Webhook   │  │ • Webhook   │  │ • Risk      │  │                 │ │ │
│  │  │ • SCIM      │  │ • SCIM      │  │ • MFA       │  │                 │ │ │
│  │  │ • SAML      │  │ • SAML      │  │ • Compliance│  │                 │ │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            SUPPORT LAYER                                       │
│                                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │
│  │    oauth    │  │   crypto    │  │   shared    │  │  infrastructure     │   │
│  │             │  │             │  │             │  │                     │   │
│  │ • OAuth 2.1 │  │ • Argon2id  │  │ • Types     │  │ • Docker            │   │
│  │ • OIDC      │  │ • JWT       │  │ • Constants │  │ • Kubernetes/Helm   │   │
│  │ • PKCE      │  │ • KeyStore  │  │ • Errors    │  │ • Terraform         │   │
│  │ • Providers │  │ • OTP/TOTP  │  │ • Events    │  │ • Monitoring        │   │
│  │ • Federation│  │ • Encryption│  │ • Utilities │  │ • Logging           │   │
│  │ • SCIM      │  │ • HSM       │  │             │  │                     │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Authentication Flow (Sequence Diagram)

```
┌────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Client │    │  Express │    │   Auth   │    │  Session │    │ MongoDB  │
│        │    │  Routes  │    │  Engine  │    │  Service │    │          │
└───┬────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    └────┬─────┘
    │              │               │               │               │
    │ 1. POST /v1/auth/login       │               │               │
    │ {email, password}            │               │               │
    │─────────────>│               │               │               │
    │              │               │               │               │
    │              │ 2. AuthEngine.loginPassword() │               │
    │              │──────────────>│               │               │
    │              │               │               │               │
    │              │               │ 3. findUser({email, tenant})  │
    │              │               │──────────────────────────────>│
    │              │               │               │               │
    │              │               │ 4. verifyPassword()          │
    │              │               │───────────────┐               │
    │              │               │               │               │
    │              │               │ 5. checkLockout()            │
    │              │               │───────────────┐               │
    │              │               │               │               │
    │              │               │ 6. checkAccountState()       │
    │              │               │───────────────┐               │
    │              │               │               │               │
    │              │               │ 7. checkMFAEnabled()         │
    │              │               │───────────────┐               │
    │              │               │               │               │
    │              │               │ 8. SessionService.create()   │
    │              │               │──────────────>│               │
    │              │               │               │               │
    │              │               │               │ 9. Session.create()
    │              │               │               │──────────────>│
    │              │               │               │               │
    │              │               │ 10. TokenService.sign()      │
    │              │               │───────────────┐               │
    │              │               │               │               │
    │              │               │ 11. AuditService.log()       │
    │              │               │───────────────┐               │
    │              │               │               │               │
    │              │ 12. {user, accessToken, refreshToken}        │
    │              │<──────────────│               │               │
    │              │               │               │               │
    │ 13. 200 OK with tokens       │               │               │
    │<─────────────│               │               │               │
    │              │               │               │               │
```

---

## 4. Refresh Token Rotation (Concurrency-Safe)

```
┌────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Client   │  │  Express    │  │   Session   │  │   MongoDB   │  │   Redis     │
│            │  │  Routes     │  │   Service   │  │             │  │             │
└─────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
      │                │                │                │                │
      │ 1. POST /v1/auth/refresh        │                │                │
      │ {refreshToken}                  │                │                │
      │───────────────>│                │                │                │
      │                │                │                │                │
      │                │ 2. SessionService.rotate()     │                │
      │                │───────────────>│                │                │
      │                │                │                │                │
      │                │                │ 3. Hash refreshToken          │
      │                │                │───────────────┐                │
      │                │                │                │                │
      │                │                │ 4. Atomic: findOneAndUpdate   │
      │                │                │    status: 'active' → 'rotating'│
      │                │                │───────────────>│                │
      │                │                │                │                │
      │                │                │ 5. If race condition:          │
      │                │                │    → REFRESH_TOKEN_REUSE      │
      │                │                │───────────────┐                │
      │                │                │                │                │
      │                │                │ 6. Create child session       │
      │                │                │───────────────>│                │
      │                │                │                │                │
      │                │                │ 7. Update parent:              │
      │                │                │    status: 'replaced'          │
      │                │                │    replacedBySessionId: child  │
      │                │                │───────────────>│                │
      │                │                │                │                │
      │                │                │ 8. Invalidate old in Redis    │
      │                │                │───────────────────────────────>│
      │                │                │                │                │
      │                │ 9. {new tokens}│                │                │
      │                │<───────────────│                │                │
      │                │                │                │                │
      │ 10. 200 OK     │                │                │                │
      │<───────────────│                │                │                │
```

---

## 5. Data Model (ER Diagram)

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│     Tenant      │       │  Application    │       │      User       │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id: string      │1   *  │ id: string      │1   *  │ id: string      │
│ name: string    │───────│ tenantId: string│───────│ tenantId: string│
│ domain: string  │       │ name: string    │       │ applicationId   │
│ plan: string    │       │ issuer: string  │       │ email: string   │
│ quota: object   │       │ audience: string│       │ phone: string   │
│ settings: object│       │ settings: object│       │ passwordHash    │
└─────────────────┘       └─────────────────┘       │ tokenVersion    │
        │                                           │ mfaEnabled      │
        │                                           │ mfaSecret       │
        │                                           │ isActive        │
        │                                           │ roles: []       │
        │                                           └─────────────────┘
        │                                                   │
        │                                                   │
        ▼                                                   ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      Role       │       │    Session      │       │    MFA Code     │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id: string      │       │ id: string      │       │ id: string      │
│ tenantId: string│       │ userId: string  │       │ userId: string  │
│ name: string    │       │ tenantId: string│       │ codeHash: string│
│ permissions: [] │       │ familyId: string│       │ type: string    │
│ description:    │       │ currentHash:    │       │ usedAt: Date    │
└─────────────────┘       │ status: string  │       │ expiresAt: Date │
                           │ expiresAt: Date│       └─────────────────┘
                           │ metadata: obj  │
                           └─────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   OAuth Client  │       │  Authorization  │       │   Audit Log     │
├─────────────────┤       │      Code       │       ├─────────────────┤
│ id: string      │       ├─────────────────┤       │ id: string      │
│ tenantId: string│       │ id: string      │       │ tenantId: string│
│ clientId: string│       │ tenantId: string│       │ eventType: str  │
│ clientSecretHash│       │ codeHash: string│       │ userId: string  │
│ redirectUris: []│       │ clientId: string│       │ data: object    │
│ scopes: []      │       │ redirectUri: str│       │ prevHash: string│
│ grants: []      │       │ codeChallenge:  │       │ hash: string    │
│ isConfidential  │       │ userId: string  │       │ timestamp: Date │
└─────────────────┘       │ usedAt: Date    │       └─────────────────┘
                           │ expiresAt: Date│
                           └─────────────────┘

┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    WebAuthn     │       │   Trusted Device│       │  Organization   │
│   Credential    │       ├─────────────────┤       ├─────────────────┤
├─────────────────┤       │ id: string      │       │ id: string      │
│ id: string      │       │ userId: string  │       │ tenantId: string│
│ userId: string  │       │ deviceId: string│       │ name: string    │
│ credentialId:   │       │ fingerprint: str│       │ parentId: string│
│ publicKey:      │       │ userAgent: string│      │ type: string    │
│ counter: number │       │ ip: string      │       │ metadata: obj   │
│ transports: []  │       │ trustedAt: Date │       └─────────────────┘
│ deviceName: str │       │ expiresAt: Date │
└─────────────────┘       └─────────────────┘
```

---

## 6. Security Architecture (Defense in Depth)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           DEFENSE IN DEPTH LAYERS                              │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 1: NETWORK SECURITY                                               │ │
│  │  • TLS 1.3 Encryption                                                    │ │
│  │  • DDoS Protection (Cloudflare/AWS Shield)                               │ │
│  │  • Web Application Firewall (WAF)                                        │ │
│  │  • IP Whitelisting/Blocklisting                                          │ │
│  │  • Rate Limiting at Edge                                                 │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 2: APPLICATION SECURITY                                           │ │
│  │  • CORS Strict Allowlist                                                 │ │
│  │  • CSRF Double-Submit Cookies                                            │ │
│  │  • Security Headers (CSP, HSTS, X-Frame-Options)                         │ │
│  │  • Input Validation & Sanitization                                       │ │
│  │  • SQL/NoSQL Injection Prevention                                        │ │
│  │  • XSS Prevention                                                        │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 3: AUTHENTICATION SECURITY                                        │ │
│  │  • Argon2id Password Hashing                                             │ │
│  │  • Multi-Factor Authentication (TOTP, WebAuthn, SMS)                     │ │
│  │  • Adaptive Authentication (Risk-Based)                                  │ │
│  │  • Account Lockout (5 attempts → 15-min lock)                            │ │
│  │  • Brute Force Protection                                                │ │
│  │  • Credential Stuffing Prevention (HIBP)                                 │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 4: SESSION & TOKEN SECURITY                                       │ │
│  │  • Short-lived Access Tokens (15 min)                                    │ │
│  │  • Rotating Refresh Tokens (one-time use)                                │ │
│  │  • Refresh Token Reuse Detection → Family Revocation                     │ │
│  │  • HttpOnly, Secure, SameSite Cookies                                    │ │
│  │  • JWT with Asymmetric Signing (RS256)                                   │ │
│  │  • JWKS for Public Key Distribution                                      │ │
│  │  • Key Rotation (30-day TTL)                                             │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 5: AUTHORIZATION SECURITY                                         │ │
│  │  • Deny-by-Default                                                       │ │
│  │  • Role-Based Access Control (RBAC)                                      │ │
│  │  • Attribute-Based Access Control (ABAC)                                 │ │
│  │  • Tenant Isolation (All queries scoped)                                 │ │
│  │  • Permission Checks Server-Side                                         │ │
│  │  • IDOR/BOLA Prevention                                                  │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 6: DATA SECURITY                                                  │ │
│  │  • Encryption at Rest (MongoDB)                                          │ │
│  │  • Encryption in Transit (TLS)                                           │ │
│  │  • Secrets Hashed (SHA-256) at Rest                                      │ │
│  │  • Field-Level Encryption (MFA Secrets)                                  │ │
│  │  • HSM Integration for Signing Keys                                      │ │
│  │  • Audit Logging (Tamper-Evident Chain)                                  │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                          │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 7: OBSERVABILITY & INCIDENT RESPONSE                             │ │
│  │  • Real-Time Monitoring (Prometheus/Grafana)                             │ │
│  │  • Distributed Tracing (OpenTelemetry/Jaeger)                            │ │
│  │  • Structured Logging (ELK/Loki)                                         │ │
│  │  • Security Alerts (breach detection)                                    │ │
│  │  • Incident Response Runbooks                                            │ │
│  │  • Disaster Recovery Drills                                              │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Deployment Architecture (Multi-Region Active-Active)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           GLOBAL TRAFFIC MANAGER                               │
│                      (AWS Route53 / Cloudflare / Azure Traffic Manager)        │
└───────────────────────────┬─────────────────────────────────────────────────────┘
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   US-EAST-1     │ │   EU-WEST-1     │ │   AP-SOUTHEAST-1│
│                 │ │                 │ │                 │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │   Load      │ │ │ │   Load      │ │ │ │   Load      │ │
│ │  Balancer   │ │ │ │  Balancer   │ │ │ │  Balancer   │ │
│ └──────┬──────┘ │ │ └──────┬──────┘ │ │ └──────┬──────┘ │
│        │        │ │        │        │ │        │        │ │
│ ┌──────┴──────┐ │ │ ┌──────┴──────┐ │ │ ┌──────┴──────┐ │
│ │  Identity   │ │ │ │  Identity   │ │ │ │  Identity   │ │
│ │  Server     │ │ │ │  Server     │ │ │ │  Server     │ │
│ │  (K8s Pods) │ │ │ │  (K8s Pods) │ │ │ │  (K8s Pods) │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
│                 │ │                 │ │                 │ │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │  MongoDB    │ │ │ │  MongoDB    │ │ │ │  MongoDB    │ │
│ │  (Primary)  │ │ │ │  (Replica)  │ │ │ │  (Replica)  │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
│                 │ │                 │ │                 │ │
│ ┌─────────────┐ │ │ ┌─────────────┐ │ │ ┌─────────────┐ │
│ │   Redis     │ │ │ │   Redis     │ │ │ │   Redis     │ │
│ │  (Cluster)  │ │ │ │  (Cluster)  │ │ │ │  (Cluster)  │ │
│ └─────────────┘ │ │ └─────────────┘ │ │ └─────────────┘ │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                  │                  │
         └──────────────────┼──────────────────┘
                            │
                    ┌───────┴───────┐
                    │  Global Data  │
                    │   Sync        │
                    │  (MongoDB     │
                    │   Change      │
                    │   Streams)    │
                    └───────────────┘
```

---

## 8. Technology Stack

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           TECHNOLOGY STACK                                     │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  RUNTIME & LANGUAGE                                                       │ │
│  │  • Node.js 24+ (Primary)                                                  │ │
│  │  • TypeScript 5+                                                          │ │
│  │  • Python 3.10+ (SDK)                                                     │ │
│  │  • Go 1.21+ (SDK)                                                         │ │
│  │  • Java 17+ (SDK)                                                         │ │
│  │  • .NET 8+ (SDK)                                                          │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  FRAMEWORKS & LIBRARIES                                                   │ │
│  │  • Express.js 5+ (HTTP Server)                                            │ │
│  │  • Apollo Server (GraphQL Federation)                                     │ │
│  │  • Socket.io (WebSocket)                                                  │ │
│  │  • Mongoose (MongoDB ODM)                                                 │ │
│  │  • ioredis (Redis Client)                                                 │ │
│  │  • jsonwebtoken (JWT)                                                     │ │
│  │  • argon2 (Password Hashing)                                              │ │
│  │  • bullmq (Job Queue)                                                     │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  DATA STORES                                                              │ │
│  │  • MongoDB (Primary Database)                                             │ │
│  │  • Redis (Cache, Rate Limiting, Pub/Sub, Locks)                           │ │
│  │  • AWS S3 / GCS (File Storage)                                            │ │
│  │  • Elasticsearch (Search/Analytics)                                       │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  SECURITY                                                                │ │
│  │  • AWS KMS / Azure Key Vault / GCP KMS (Key Management)                  │ │
│  │  • AWS CloudHSM / Thales (HSM)                                            │ │
│  │  • Let's Encrypt / AWS ACM (TLS)                                          │ │
│  │  • Cloudflare (WAF/DDoS)                                                  │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  OBSERVABILITY                                                            │ │
│  │  • Prometheus (Metrics)                                                   │ │
│  │  • Grafana (Dashboards)                                                   │ │
│  │  • OpenTelemetry (Tracing)                                                │ │
│  │  • Jaeger (Trace Visualization)                                           │ │
│  │  • Loki (Log Aggregation)                                                 │ │
│  │  • Sentry (Error Tracking)                                                │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  INFRASTRUCTURE                                                           │ │
│  │  • Docker (Containerization)                                              │ │
│  │  • Kubernetes (Orchestration)                                             │ │
│  │  • Helm (Package Management)                                              │ │
│  │  • Terraform (Infrastructure as Code)                                     │ │
│  │  • GitHub Actions (CI/CD)                                                 │ │
│  │  • AWS / Azure / GCP (Cloud Provider)                                     │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Scalability Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SCALABILITY PATTERNS                                  │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  HORIZONTAL SCALING                                                        │ │
│  │                                                                           │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │ │
│  │  │  Pod 1  │ │  Pod 2  │ │  Pod 3  │ │  Pod 4  │ │  Pod N  │            │ │
│  │  │ Server  │ │ Server  │ │ Server  │ │ Server  │ │ Server  │            │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘            │ │
│  │       │           │           │           │           │                   │ │
│  │       └───────────┴───────────┼───────────┴───────────┘                   │ │
│  │                               │                                            │ │
│  │  ┌────────────────────────────┴────────────────────────────┐              │ │
│  │  │                   SHARED STATE                          │              │ │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │              │ │
│  │  │  │   MongoDB    │  │    Redis     │  │   JWKS       │  │              │ │
│  │  │  │   (Primary)  │  │   (Cache)    │  │   (Public)   │  │              │ │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘  │              │ │
│  │  └───────────────────────────────────────────────────────────┘              │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  STATELESS VS STATEFUL                                                    │ │
│  │                                                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │  │  STATELESS (Horizontal Scaling)                                     │ │ │
│  │  │  • JWT Verification (no session store lookup)                       │ │ │
│  │  │  • JWKS Caching (public keys)                                       │ │ │
│  │  │  • Rate Limiting (Redis-backed)                                     │ │ │
│  │  │  • OIDC Discovery (.well-known)                                     │ │ │
│  │  └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │  │  STATEFUL (Requires Shared Store)                                   │ │ │
│  │  │  • Session Creation/Revocation (MongoDB)                            │ │ │
│  │  │  • Refresh Token Rotation (MongoDB)                                 │ │ │
│  │  │  • OAuth Code Redemption (MongoDB)                                  │ │ │
│  │  │  • Audit Logging (MongoDB)                                          │ │ │
│  │  └─────────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  CACHING STRATEGY                                                         │ │
│  │                                                                           │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │  │  L1: In-Memory Cache (Process Local)                                │ │ │
│  │  │  • JWKS (5 min TTL)                                                 │ │ │
│  │  │  • Account State (30 sec TTL)                                       │ │ │
│  │  │  • Tenant Config (1 min TTL)                                        │ │ │
│  │  └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                              │                                            │ │
│  │                              ▼                                            │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │  │  L2: Redis Cache (Distributed)                                      │ │ │
│  │  │  • Session Liveness (30 sec TTL)                                    │ │ │
│  │  │  • Rate Limits (Sliding Window)                                     │ │ │
│  │  │  • OTP Attempts (5 min TTL)                                         │ │ │
│  │  │  • Distributed Locks (Redlock)                                      │ │ │
│  │  └─────────────────────────────────────────────────────────────────────┘ │ │
│  │                              │                                            │ │
│  │                              ▼                                            │ │
│  │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│  │  │  L3: Database (Source of Truth)                                     │ │ │
│  │  │  • All Durable State                                                │ │ │
│  │  │  • Audit Log Chain                                                  │ │ │
│  │  │  • Session Families                                                 │ │ │
│  │  └─────────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           COMPONENT INTERACTIONS                               │
│                                                                                 │
│                              ┌─────────────────┐                               │
│                              │   HTTP Request  │                               │
│                              └────────┬────────┘                               │
│                                       │                                         │
│                                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         REQUEST CONTEXT MIDDLEWARE                          ││
│  │  • Assigns Request ID                                                      ││
│  │  • Creates Child Logger                                                    ││
│  │  • Starts Timer                                                            ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                       │                                         │
│                                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                          SECURITY MIDDLEWARE                               ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐ ││
│  │  │    CORS     │  │   Security  │  │    CSRF     │  │   Rate Limit      │ ││
│  │  │  Middleware │──│   Headers   │──│  Middleware │──│   Middleware      │ ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └───────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                       │                                         │
│                                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         AUTH MIDDLEWARE                                     ││
│  │  ┌─────────────────────────────────────────────────────────────────────────┐││
│  │  │  • Extract Token (Bearer/Cookie)                                       │││
│  │  │  • Verify JWT Signature (JWKS)                                         │││
│  │  │  • Validate Claims (exp, iss, aud)                                     │││
│  │  │  • Check Account State (tokenVersion)                                  │││
│  │  │  • Attach Identity (req.pezhwan)                                       │││
│  │  └─────────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                       │                                         │
│                                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         TENANT MIDDLEWARE                                   ││
│  │  • Validate Tenant Context                                                 ││
│  │  • Load Tenant Configuration                                               ││
│  │  • Apply Tenant Quotas                                                     ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                       │                                         │
│                    ┌──────────────────┼──────────────────┐                     │
│                    │                  │                  │                     │
│                    ▼                  ▼                  ▼                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐               │
│  │  Auth Routes    │  │  Session Routes │  │  OAuth Routes   │               │
│  │  • /register    │  │  • /list        │  │  • /authorize   │               │
│  │  • /login       │  │  • /revoke      │  │  • /token       │               │
│  │  • /refresh     │  │  • /revoke-all  │  │  • /clients     │               │
│  │  • /logout      │  │                 │  └─────────────────┘               │
│  │  • /otp         │  └─────────────────┘                                     │
│  │  • /password    │                                                          │
│  │  • /mfa         │                                                          │
│  └─────────────────┘                                                          │
│                    │                                                           │
│                    ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         AUTH ENGINE                                        ││
│  │                                                                             ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  ││
│  │  │  Password   │  │    OTP      │  │    MFA      │  │   Session        │  ││
│  │  │  Service    │  │   Service   │  │   Service   │  │   Service        │  ││
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘  ││
│  │         │                │                │                  │             ││
│  │         └────────────────┼────────────────┼──────────────────┘             ││
│  │                          │                │                                 ││
│  │               ┌──────────┴────────────────┴──────────┐                      ││
│  │               │             Token Service             │                      ││
│  │               │  • JWT Sign/Verify (RS256)            │                      ││
│  │               │  • Refresh Token Generation           │                      ││
│  │               │  • Token Rotation                     │                      ││
│  │               └───────────────────────────────────────┘                      ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                       │                                         │
│                                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         DATA ACCESS LAYER                                  ││
│  │                                                                             ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  ││
│  │  │   User      │  │   Session   │  │   Audit     │  │   OAuth Code     │  ││
│  │  │   Model     │  │   Model     │  │   Model     │  │   Model          │  ││
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘  ││
│  │         │                │                │                  │             ││
│  │         └────────────────┼────────────────┼──────────────────┘             ││
│  │                          │                │                                 ││
│  │              ┌───────────┴────────────────┴────────────┐                    ││
│  │              │         MongoDB Connection Pool          │                    ││
│  │              │  • Read/Write Splitting                 │                    ││
│  │              │  • Connection Health Checks              │                    ││
│  │              └──────────────────────────────────────────┘                    ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                       │                                         │
│                                       ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         RESPONSE HANDLING                                  ││
│  │  • Audit Logging                                                           ││
│  │  • Webhook Delivery (Async)                                                ││
│  │  • Metrics Collection                                                      ││
│  │  • Response Timing                                                         ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 11. Key Performance Indicators (KPIs)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              KEY PERFORMANCE INDICATORS                        │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  PERFORMANCE                                                              │ │
│  │  • Authentication: < 50ms p95                                             │ │
│  │  • Token Verification: < 10ms p95                                         │ │
│  │  • Session Lookup: < 20ms p95                                             │ │
│  │  • Throughput: 10,000 RPS per instance                                    │ │
│  │  • Database Queries: < 5 per request                                      │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  AVAILABILITY                                                             │ │
│  │  • Uptime: 99.99% (≈ 52 min/year downtime)                                │ │
│  │  • Recovery Time: < 60 seconds                                            │ │
│  │  • Redis Availability: 99.95%                                             │ │
│  │  • MongoDB Availability: 99.99%                                           │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  SECURITY                                                                 │ │
│  │  • Password Hashing: Argon2id (64 MiB, 3 iterations)                      │ │
│  │  • Token TTL: 15 min (access), 30 days (refresh)                          │ │
│  │  • Rate Limits: 10/min (login), 5/min (OTP)                              │ │
│  │  • MFA Lockout: 5 attempts → 15-min lock                                 │ │
│  │  • Refresh Rotation: 1 success, 7 reuse-rejected                         │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  SCALABILITY                                                              │ │
│  │  • Horizontal Scaling: Unlimited instances                                │ │
│  │  • Database Connections: 100 per instance                                 │ │
│  │  • Redis Connections: 50 per instance                                     │ │
│  │  • Cache Hit Rate: > 95%                                                 │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture Summary

| Aspect | Design Choice | Rationale |
|--------|--------------|-----------|
| **Modular Monorepo** | npm workspaces | Code sharing, versioning, single build |
| **Package Layering** | Strict dependency direction | Clear boundaries, testability |
| **Stateless Core** | JWT with local verification | Horizontal scaling, no session lookup |
| **Stateful Operations** | MongoDB as source of truth | Durability, auditability, transactions |
| **Redis as Cache** | Performance accelerator | Reduces database load, distributed limits |
| **Fail-Closed Security** | No identity on uncertainty | Security over availability |
| **Multi-Language SDKs** | 7+ languages | Developer adoption, ecosystem |
| **Enterprise Features** | ABAC, SCIM, SAML, Webhooks | Enterprise requirements |
