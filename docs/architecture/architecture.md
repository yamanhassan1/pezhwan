# PEZHWAN — Enterprise Architecture (Quantum-Safe, Production-Hardened)

## Architecture Overview

PEZHWAN is a **universal, quantum-safe Identity & Access Management (IAM) SDK** built as a **modular monorepo** with strict package layering. The architecture follows **domain-driven design** principles with clear separation of concerns, delivering **crypto-agile**, **edge-verifiable**, **horizontally scalable** authentication for enterprise deployments.

**Key architectural shifts in this revision:**

- **Hybrid post-quantum cryptography** (RS256 + ML-DSA-65) at the token layer
- **Edge token verification** — origin servers handle only writes
- **Strict audit ordering** via atomic sequence + transactions
- **Fail-closed dependency policy** — no silent degradation of security
- **Multi-region active-active** with global session revocation
- **Crypto agility** — every algorithm is a config value, not a code literal

---

## 1. System Context Diagram

```mermaid
flowchart TB
    subgraph EXT["External Systems"]
        direction LR
        BR["Browser (React)"]
        MB["Mobile App (iOS / Android)"]
        API["Backend API (Node.js)"]
        IDP["Third-party IdPs (Google / GitHub / MS)"]
    end
    EXT --> EDGE["Edge Verification Layer<br/>&bull; JWKS cache (kid-keyed, 10 min TTL)<br/>&bull; Hybrid JWT verification (RS256 + ML-DSA-65)<br/>&bull; Rate limiting (edge)<br/>&bull; WAF / DDoS protection<br/>&bull; Origin sees writes only - 95% offload"]
    EDGE --> GW["API Gateway Layer<br/>&bull; Express REST API<br/>&bull; GraphQL Federation<br/>&bull; WebSocket server<br/>&bull; gRPC gateway<br/>&bull; SCIM / SAML federation"]
    GW --> SEC["Security Middleware Layer<br/>&bull; CORS<br/>&bull; CSRF<br/>&bull; Rate limit<br/>&bull; Auth middleware<br/>&bull; Tenant middleware<br/>&bull; Risk middleware<br/>&bull; Crypto-Agility Guard (NEW)"]
    SEC --> CORE["Core Engine Layer<br/>&bull; Auth Engine / Session Manager / Authorization (RBAC + ABAC)<br/>&bull; MFA / OTP / WebAuthn (FIDO2)<br/>&bull; OAuth / OIDC / Tenant / Org / Team<br/>&bull; Audit (ordered) / Event Bus / Webhook delivery<br/>&bull; SCIM 2.0 / SAML 2.0 / Risk / Breach / Compliance (GDPR etc.)<br/>&bull; Subscription / Billing"]
    CORE --> INFRA["Infrastructure Layer<br/>&bull; MongoDB (ReplSet)<br/>&bull; Redis (Cluster)<br/>&bull; KeyStore (hybrid)<br/>&bull; HSM / KMS<br/>&bull; Job Queue (BullMQ)"]
```

---

## 2. Package Architecture (Dependency Graph)

```mermaid
flowchart TB
    subgraph APP["Application Layer"]
        direction LR
        IS["identity-server"]
        AC["admin-console<br/>(React Admin)"]
        DP["developer-portal<br/>(React Developer)"]
    end
    subgraph SDK["SDK Layer"]
        direction LR
        S1["react"]
        S2["angular"]
        S3["vue"]
        S4["node"]
        S5["express"]
        S6["python"]
        S7["go"]
        S8["java"]
        S9["dotnet"]
        S10["cli"]
        S11["terraform"]
    end
    subgraph CORE["Core Layer"]
        direction LR
        C1["Services<br/>&bull; Auth, Session, MFA, OAuth<br/>&bull; RBAC / ABAC, Audit (ordered)<br/>&bull; Webhook, SCIM, SAML, Teams<br/>&bull; Billing, Events, ES / CQRS"]
        C2["Models<br/>&bull; User, Session, Tenant, Role<br/>&bull; OTP, Audit, Webhook, SCIM<br/>&bull; SAML, WebAuthn, Risk, Team<br/>&bull; Org, Subs, Policy"]
        C3["Middleware<br/>&bull; Auth, Tenant, Rate, CSRF<br/>&bull; CORS, Risk, MFA, Compliance<br/>&bull; Fresh perms"]
        C4["Adapters<br/>&bull; Email, SMS, Payment<br/>&bull; Storage, IDP, HSM, PQC"]
        C5["Plugins (NEW)<br/>&bull; Lifecycle<br/>&bull; Hooks<br/>&bull; Sandbox"]
    end
    subgraph SUPPORT["Support Layer"]
        direction LR
        OAUTH["oauth<br/>&bull; OAuth 2.1, OIDC, PKCE<br/>&bull; Provisioning, Federation<br/>&bull; SCIM, SAML"]
        CRYPTO["crypto<br/>&bull; Classical: Argon2, RSA, ECDSA, EdDSA,<br/>&nbsp;&nbsp;AES-GCM, SHA-256, JWT, KeyStore<br/>&bull; PQC (NEW): ML-KEM, ML-DSA,<br/>&nbsp;&nbsp;SLH-DSA, HSM, ZKP<br/>&bull; Hybrid (NEW): RS256 + ML-DSA,<br/>&nbsp;&nbsp;X25519 + ML-KEM"]
        SHARED["shared<br/>&bull; Types, Errors, Events, Consts"]
        INFRA["infra<br/>&bull; Docker, K8s / Helm, Terraform<br/>&bull; Monitoring, Logging, Secrets (NEW)"]
    end
    APP --> SDK
    SDK --> CORE
    CORE --> SUPPORT
```

---

## 3. Cryptography Architecture (NEW — Crypto Agility + PQC)

```mermaid
flowchart TB
    CONFIG["CONFIG-DRIVEN ALGORITHM SELECTION<br/><br/>PEZHWAN_JWT_SIGNING_ALGORITHM =<br/>&nbsp;&nbsp;RS256 | ES256 | EdDSA | ML-DSA-65 | ML-DSA-87 |<br/>&nbsp;&nbsp;hybrid-RS256-MLDSA65 | hybrid-ES256-MLDSA65<br/><br/>PEZHWAN_KEY_ENCAPSULATION_ALGORITHM =<br/>&nbsp;&nbsp;RSA-OAEP | ECDH | ML-KEM-768 | ML-KEM-1024 |<br/>&nbsp;&nbsp;hybrid-X25519-MLKEM768<br/><br/>NO ALGORITHM LITERALS ANYWHERE IN APPLICATION CODE"]
    CONFIG --> FAM
    subgraph FAM["ALGORITHM FAMILIES"]
        direction LR
        C["CLASSICAL<br/>&bull; Signing: RS256 (RSA-2048),<br/>&nbsp;&nbsp;ES256 (P-256), EdDSA (Ed25519)<br/>&bull; KEM: RSA-OAEP, ECDH (P-256), X25519<br/>&bull; Hashing: SHA-256 / 512, Argon2id"]
        P["POST-QUANTUM (NIST FIPS)<br/>&bull; Signing: ML-DSA-65, ML-DSA-87, SLH-DSA<br/>&bull; KEM: ML-KEM-768, ML-KEM-1024<br/>&bull; Hashing: SHA3-256 / 512"]
        H["HYBRID (BSI recommended)<br/>&bull; Signing: RS256 + ML-DSA,<br/>&nbsp;&nbsp;ES256 + ML-DSA<br/>&bull; KEM: X25519 + ML-KEM"]
    end
    FAM --> KS["KEY STORE STATE MACHINE"]
    KS --- G["GENERATED"] --> ST["STAGED"] --> AC["ACTIVE"] --> VO["VERIFY-ONLY"] --> RE["RETIRED"] --> RV["REVOKED"]
    KS --> RULES["Rules<br/>&bull; Only ACTIVE signs<br/>&bull; Only non-revoked keys appear in JWKS<br/>&bull; PQC keys stay VERIFY-ONLY for the max token lifetime (30 days)<br/>&bull; Hybrid keys rotate classical and PQC atomically"]
    RULES --> HSM["HSM / KMS BACKENDS<br/>&bull; PKCS#11 (AWS CloudHSM, Thales, nCipher)<br/>&bull; AWS KMS / Azure Key Vault / GCP KMS<br/>&bull; Private key never leaves the HSM"]
```

---

## 4. Authentication Flow (Hybrid PQC Signing)

```mermaid
sequenceDiagram
    participant C as Client
    participant E as Express Routes
    participant AE as Auth Engine
    participant SS as Session Service
    participant TS as Token Service
    participant KS as KeyStore (Hybrid)
    participant DB as MongoDB
    C->>E: 1. POST /v1/auth/login (email, password)
    E->>AE: 2. loginPassword()
    AE->>DB: 3. findUser(email, tenant)
    AE->>AE: 4. verifyPassword (Argon2id)
    AE->>AE: 5. checkLockout()
    AE->>AE: 6. checkAccountState()
    AE->>AE: 7. checkMFAEnabled()
    AE->>SS: 8. SessionService.create()
    SS->>DB: 9. Session.create()
    SS->>TS: 10. TokenService.signPair()
    TS->>KS: 10a. Sign RS256 (classical)
    TS->>KS: 10b. Sign ML-DSA-65 (PQC)
    TS->>TS: 10c. Combine to hybrid token
    SS->>DB: 11. AuditService.log() (ordered)
    SS-->>E: 12. user, accessToken (hybrid), refreshToken
    E-->>C: 13. 200 OK with hybrid-signed JWT
```

---

## 5. Edge Verification Flow (Origin Offload)

```mermaid
sequenceDiagram
    participant C as Client
    participant EDGE as CDN / Edge Worker
    participant OR as Origin (Read path)
    participant JWKS as JWKS Endpoint
    participant OW as Origin (Write)
    C->>EDGE: 1. GET /api/me with Bearer token
    EDGE->>EDGE: 2. Extract kid from JWT header
    EDGE->>EDGE: 3. Look up kid in local cache
    EDGE->>JWKS: 4. Cache MISS - fetch JWKS once
    JWKS-->>EDGE: 5. Return JWKS (cached 10 min TTL)
    EDGE->>EDGE: 6. Verify BOTH signatures (RS256 + ML-DSA-65)
    EDGE->>OR: 7. Valid - forward to origin
    OR->>OR: 8. Business logic (no auth check)
    OR-->>EDGE: 9. Response
    EDGE-->>C: 10. 200 OK
    note over EDGE,OW: 95%+ of authenticated reads served at the edge - origin handles writes and cache misses
```

---

## 6. Refresh Token Rotation (Transactional, PQC-bound)

```mermaid
sequenceDiagram
    participant C as Client
    participant E as Express Routes
    participant SS as Session Service
    participant DB as MongoDB (Transaction)
    participant R as Redis Cache
    participant A as Audit (Seq)
    C->>E: 1. POST /v1/auth/refresh (refreshToken)
    E->>SS: 2. rotate()
    SS->>SS: 3. Hash token (SHA-256)
    SS->>DB: 4. BEGIN TX
    SS->>DB: 5. Atomic findOneAndUpdate (active to rotating)
    alt Race detected
        SS->>SS: 6. ROLLBACK - throw REFRESH_TOKEN_REUSE
    else Normal
        SS->>DB: 7. Create child session
        SS->>DB: 8. Update parent (replacedBySessionId = child)
        SS->>DB: 9. COMMIT TX
    end
    SS->>SS: 10. Sign hybrid token pair
    SS->>R: 11. Invalidate old session
    SS->>A: 12. Audit [sequence + 1]
    SS-->>E: 13. new tokens
    E-->>C: 14. 200 OK
    note over SS,DB: MongoDB transaction - snapshot read, majority write guarantee
```

---

## 7. Data Model (Extended ER Diagram)

```mermaid
erDiagram
    Tenant ||--o{ Application : "owns"
    Application ||--o{ User : "has"
    Tenant ||--o{ Role : "defines"
    Tenant ||--o{ OAuthClient : "owns"
    Tenant ||--o{ AuditLog : "records"
    Tenant ||--o{ Webhook : "delivers"
    Tenant ||--o{ ABACPolicy : "defines"
    Tenant ||--o{ Subscription : "bills"
    Tenant ||--o{ Organization : "contains"
    User ||--o{ Session : "owns"
    User ||--o{ WebAuthnCredential : "registers"
    User ||--o{ RiskEvent : "produces"
    User ||--o{ TrustedDevice : "uses"
    User ||--o{ AuthorizationCode : "authorizes"
    OAuthClient ||--o{ AuthorizationCode : "issues"
    Webhook ||--o{ WebhookDelivery : "targets"

    Tenant {
        string id
        string name
        string domain
        string plan
        object quota
        object settings
        bool pqcEnabled
        object compliance
    }
    Application {
        string id
        string tenantId
        string name
        string issuer
        string audience
        object settings
        bool pqcEnabled
        object compliance
    }
    User {
        string id
        string tenantId
        string applicationId
        string email
        string phone
        string passwordHash
        int tokenVersion
        bool mfaEnabled
        string mfaSecret
        string mfaSecret_enc
        bool isActive
        string[] roles
        string[] webauthnCreds
        int riskScore
    }
    Role {
        string id
        string tenantId
        string name
        string[] permissions
        string description
        int priority
    }
    Session {
        string id
        string userId
        string tenantId
        string familyId
        string currentHash
        string status
        date expiresAt
        object metadata
        bool pqcBound
    }
    WebAuthnCredential {
        string id
        string userId
        string credentialId
        string publicKey
        int counter
        string[] transports
        string deviceName
        bool backedUp
    }
    OAuthClient {
        string id
        string tenantId
        string clientId
        string clientSecretHash
        string[] redirectUris
        string[] scopes
        string[] grants
        bool isConfidential
        string certThumbprint
    }
    AuthorizationCode {
        string id
        string tenantId
        string codeHash
        string clientId
        string redirectUri
        string codeChallenge
        string userId
        date usedAt
        date expiresAt
    }
    AuditLog {
        string id
        string tenantId
        int sequence
        string eventType
        string userId
        object data
        string prevHash
        string hash
        date timestamp
        string algorithm
    }
    RiskEvent {
        string id
        string userId
        int score
        object signals
        string action
        date timestamp
        bool resolved
    }
    TrustedDevice {
        string id
        string userId
        string deviceId
        string fingerprint
        string userAgent
        string ip
        date trustedAt
        date expiresAt
    }
    Organization {
        string id
        string tenantId
        string name
        string parentId
        string type
        object metadata
    }
    AuditSequence {
        string _id
        int sequence
    }
    Webhook {
        string id
        string tenantId
        string url
        string[] events
        string secretHash
        object retryConfig
        string status
    }
    WebhookDelivery {
        string id
        string webhookId
        string eventId
        string status
        int attempts
        object response
    }
    ABACPolicy {
        string id
        string tenantId
        string resource
        string[] rules
        string effect
        string[] conditions
    }
    EventStore {
        string id
        string aggregateId
        string aggregateType
        int version
        string type
        object data
        date timestamp
    }
    Subscription {
        string id
        string tenantId
        string plan
        string status
        object usage
        object limits
    }
```

---

## 8. Security Architecture (Defense in Depth, Quantum-Safe)

```mermaid
flowchart TB
    subgraph L1["Layer 1: Network Security"]
        N1["&bull; TLS 1.3 Encryption (TLS_AES_256_GCM_SHA384)<br/>&bull; DDoS Protection (Cloudflare / AWS Shield)<br/>&bull; Web Application Firewall (WAF)<br/>&bull; IP Whitelisting / Blocklisting<br/>&bull; Edge Rate Limiting (10k RPS burst tolerance)"]
    end
    subgraph L2["Layer 2: Application Security"]
        N2["&bull; CORS Strict Allowlist (never wildcard)<br/>&bull; CSRF Double-Submit Cookies<br/>&bull; Security Headers (CSP, HSTS, X-Frame-Options)<br/>&bull; Input Validation and Sanitization (Zod schemas)<br/>&bull; NoSQL Injection Prevention<br/>&bull; Body Size Cap (100 KB default, env-tunable)"]
    end
    subgraph L3["Layer 3: Authentication Security (Quantum-Safe)"]
        N3["&bull; Argon2id Password Hashing (64 MiB, t=3, p=1)<br/>&bull; Hybrid JWT Signing: RS256 + ML-DSA-65 (NEW)<br/>&bull; Hybrid KEM: X25519 + ML-KEM-768 (NEW)<br/>&bull; MFA: TOTP, WebAuthn / FIDO2, SMS<br/>&bull; Adaptive Authentication (risk-based, 0-100 score)<br/>&bull; Account Lockout (5 attempts - 15 min lock)<br/>&bull; Brute Force Protection (per-IP + per-user)<br/>&bull; Credential Stuffing Prevention (HIBP K-Anonymity)<br/>&bull; Zero-Knowledge Proofs (age, membership, residency) (NEW)"]
    end
    subgraph L4["Layer 4: Session and Token Security"]
        N4["&bull; Short-lived Access Tokens (15 min, hybrid-signed)<br/>&bull; Rotating Refresh Tokens (one-time, transactional)<br/>&bull; Refresh Token Reuse - Family Revocation (atomic)<br/>&bull; HttpOnly, Secure, SameSite Cookies<br/>&bull; JWKS Publication (classical + PQC keys)<br/>&bull; Key Rotation State Machine (GENERATED-RETIRED-REVOKED)<br/>&bull; HSM-backed Signing (PKCS#11 / KMS)"]
    end
    subgraph L5["Layer 5: Authorization Security"]
        N5["&bull; Deny-by-Default<br/>&bull; Role-Based Access Control (RBAC)<br/>&bull; Attribute-Based Access Control (ABAC) (NEW)<br/>&bull; Tenant Isolation (all queries scoped)<br/>&bull; Permission Checks Server-Side<br/>&bull; IDOR / BOLA Prevention<br/>&bull; Opt-in Fresh Permission Re-check (NEW)"]
    end
    subgraph L6["Layer 6: Data Security"]
        N6["&bull; Encryption at Rest (MongoDB + AES-256)<br/>&bull; Encryption in Transit (TLS 1.3)<br/>&bull; Secrets Hashed at Rest (SHA-256 / SHA3-256)<br/>&bull; Field-Level Envelope Encryption (AES-256-GCM) (NEW)<br/>&bull; HSM / KMS for Signing Keys<br/>&bull; Audit Log Chain (strictly ordered, SHA-256) (NEW)<br/>&bull; Secret Provider Abstraction (Vault / KMS / Env / File) (NEW)"]
    end
    subgraph L7["Layer 7: Observability and Incident Response"]
        N7["&bull; Real-Time Monitoring (Prometheus / Grafana)<br/>&bull; Distributed Tracing (OpenTelemetry / Jaeger)<br/>&bull; Structured Logging (ELK / Loki)<br/>&bull; Security Alerts (breach detection, impossible travel)<br/>&bull; Incident Response Runbooks<br/>&bull; Disaster Recovery Drills (quarterly, automated)<br/>&bull; PQC algorithm visibility in traces (algorithm=hybrid-...) (NEW)"]
    end
    L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7
```

---

## 9. Deployment Architecture (Multi-Region Active-Active, Quantum-Safe)

```mermaid
flowchart TB
    GTM["GLOBAL TRAFFIC MANAGER<br/>(AWS Route53 / Cloudflare / Azure Traffic Manager)<br/><br/>Edge JWKS Cache (kid-keyed, 10 min TTL)<br/>Edge Hybrid Verification (RS256 + ML-DSA-65)"]
    subgraph US["US-EAST-1"]
        direction TB
        U1["Load Balancer"] --> U2["Identity Server (K8s Pods)<br/>HPA: 2-50"] --> U3["MongoDB 3-node RS (Primary)"]
        U2 --> U4["Redis Cluster (3m + 3r)"]
        U2 --> U5["HSM / KMS (Regional)"]
    end
    subgraph EU["EU-WEST-1"]
        direction TB
        E1["Load Balancer"] --> E2["Identity Server (K8s Pods)<br/>HPA: 2-50"] --> E3["MongoDB 3-node RS (Replica)"]
        E2 --> E4["Redis Cluster (3m + 3r)"]
        E2 --> E5["HSM / KMS (Regional)"]
    end
    subgraph AP["AP-SOUTHEAST-1"]
        direction TB
        A1["Load Balancer"] --> A2["Identity Server (K8s Pods)<br/>HPA: 2-50"] --> A3["MongoDB 3-node RS (Replica)"]
        A2 --> A4["Redis Cluster (3m + 3r)"]
        A2 --> A5["HSM / KMS (Regional)"]
    end
    GTM --> U1
    GTM --> E1
    GTM --> A1
    U3 & E3 & A3 --> SYNC["GLOBAL DATA SYNC<br/>&bull; MongoDB Change Streams<br/>&bull; Redis Pub / Sub<br/>&bull; Session revocation propagation < 2s"]
```

---

## 10. Caching Strategy (3-Tier)

```mermaid
flowchart TB
    L1["L1: EDGE CACHE (CDN / Worker)<br/><br/>&bull; JWKS (kid-keyed, 10 min TTL)<br/>&bull; OIDC Discovery (.well-known, 1 hour TTL)<br/>&bull; Static assets (immutable)<br/>&bull; Hit rate &gt; 99% for JWKS"]
    L2["L2: PROCESS-LOCAL CACHE (in-memory per pod)<br/><br/>&bull; JWKS keys (5 min TTL) - fallback when edge unavailable<br/>&bull; Account state (30 sec TTL)<br/>&bull; Tenant config (1 min TTL)<br/>&bull; Key store (kid-keyed, no TTL - key state machine drives eviction)"]
    L3["L3: DISTRIBUTED CACHE (Redis Cluster)<br/><br/>&bull; Session liveness (30 sec TTL)<br/>&bull; Rate limits (sliding window)<br/>&bull; OTP attempts (5 min TTL)<br/>&bull; Distributed locks (Redlock)<br/>&bull; Global revocation pub / sub"]
    L4["L4: SOURCE OF TRUTH (MongoDB replica set)<br/><br/>&bull; All durable state<br/>&bull; Audit log chain (strictly ordered)<br/>&bull; Session families<br/>&bull; Refresh token rotation (transactional)"]
    L1 --> L2
    L2 --> L3
    L3 --> L4
```

---

## 11. Observability Architecture

```mermaid
flowchart TB
    MET["METRICS (Prometheus)<br/><br/>HTTP Layer:<br/>&bull; pezhwan_http_requests_total{method, route, status}<br/>&bull; pezhwan_http_request_duration_seconds{method, route}<br/><br/>Auth Layer:<br/>&bull; pezhwan_auth_success_total{method, algorithm} (PQC visible)<br/>&bull; pezhwan_auth_failure_total{method, reason}<br/>&bull; pezhwan_mfa_locked_total{tenant}<br/><br/>Crypto Layer:<br/>&bull; pezhwan_jwt_sign_duration_seconds{algorithm}<br/>&bull; pezhwan_jwt_verify_duration_seconds{algorithm}<br/>&bull; pezhwan_key_rotation_age_days{kid, status}<br/><br/>Data Layer:<br/>&bull; pezhwan_db_query_duration_seconds{collection, op}<br/>&bull; pezhwan_db_pool_connections_active<br/>&bull; pezhwan_db_pool_waiting<br/>&bull; pezhwan_redis_hit_rate<br/><br/>Business:<br/>&bull; pezhwan_sessions_active{tenant}<br/>&bull; pezhwan_webhook_deliveries_total{status}<br/>&bull; pezhwan_rate_limit_hits_total{endpoint}"]
    MET --> TRC["TRACING (OpenTelemetry to Jaeger)<br/><br/>Spans:<br/>&bull; http.request<br/>&bull; auth.verify (algorithm=hybrid-RS256-MLDSA65)<br/>&bull; session.lookup<br/>&bull; audit.write (sequence=N)<br/>&bull; webhook.deliver<br/><br/>Attributes: user.id, tenant.id, session.id, algorithm, auth.method<br/>Sampling: configurable via PEZHWAN_OTEL_SAMPLING"]
    TRC --> LOG["LOGGING (Structured JSON to Loki / ELK)<br/><br/>Every log includes:<br/>&bull; requestId, correlationId<br/>&bull; userId, tenantId, sessionId<br/>&bull; algorithm (when crypto involved)<br/>&bull; No secrets (auto-redacted: password, tokens, keys, OTP)"]
    LOG --> AL["ALERTS (Prometheus Alertmanager)<br/><br/>&bull; HighAuthFailureRate (5xx &gt; 5% for 5m) [critical]<br/>&bull; RefreshTokenReuse (rate &gt; 10/min) [critical]<br/>&bull; MFA Lockouts Spike (&gt; 50/5m) [warning]<br/>&bull; Audit Chain Break (verification fails) [critical]<br/>&bull; Key Rotation Overdue (&gt; 35 days) [warning]<br/>&bull; DB Pool Exhausted (&gt; 95%) [critical]<br/>&bull; Redis Unavailable (ping fails 30s) [critical]<br/>&bull; Webhook Delivery Failing (&gt; 10% for 10m) [warning]<br/>&bull; Impossible Travel Detected [warning]"]
```

---

## 12. Key Performance Indicators (Updated)

### Performance (PQC-Updated)

| Metric                   | Target                                     |
| ------------------------ | ------------------------------------------ |
| Authentication (login)   | < 100 ms p95 (PQC signing impact accepted) |
| JWT verification (edge)  | < 10 ms p95 (hybrid verify, cached JWKS)   |
| Session refresh          | < 100 ms p95 (transactional rotation)      |
| Login throughput         | 10,000 RPS per instance                    |
| Verify throughput (edge) | 50,000 RPS per edge node                   |
| Database queries         | < 5 per request (write path only)          |

### Availability

| Metric                   | Target                          |
| ------------------------ | ------------------------------- |
| Uptime SLO               | 99.99% (≈ 52 min/year downtime) |
| Recovery Time Objective  | < 60 seconds                    |
| Recovery Point Objective | < 24 hours                      |
| Redis availability       | 99.95%                          |
| MongoDB availability     | 99.99%                          |
| Multi-region failover    | < 30 seconds                    |

### Security (Quantum-Safe)

| Metric           | Target                                    |
| ---------------- | ----------------------------------------- |
| Password hashing | Argon2id (64 MiB, t=3, p=1)               |
| JWT signing      | Hybrid RS256 + ML-DSA-65 (default)        |
| Session KEM      | Hybrid X25519 + ML-KEM-768                |
| Token TTL        | 15 min (access), 30 days (refresh)        |
| Rate limits      | 10/min (login), 5/min (OTP)               |
| MFA lockout      | 5 attempts → 15-min lock                  |
| Refresh rotation | 1 success / 7 reuse-rejected (concurrent) |
| Crypto agility   | 0 hardcoded algorithms in app code        |

### Scalability

| Metric                | Target                                 |
| --------------------- | -------------------------------------- |
| Horizontal scaling    | Unlimited instances (stateless verify) |
| DB connections/pod    | 25 (pooled, multiplexed)               |
| Redis connections/pod | 50                                     |
| Cache hit rate        | > 95% (L1 + L2 + L3 combined)          |
| Origin offload        | > 95% of reads served at edge          |

---

## 13. Technology Stack (Updated)

### Runtime & Language

- Node.js 24+ (primary runtime)
- TypeScript 5+ (SDK + server)
- Python 3.10+ (SDK)
- Go 1.21+ (SDK)
- Java 17+ (SDK)
- .NET 8+ (SDK)

### Cryptography (Updated)

- **Classical:** RS256, ES256, EdDSA, Argon2id, AES-256-GCM, SHA-256
- **PQC:** ML-KEM-768/1024, ML-DSA-65/87, SLH-DSA (NIST FIPS 203-205)
- **Hybrid:** RS256 + ML-DSA-65, ES256 + ML-DSA-65, X25519 + ML-KEM-768
- **ZKP:** ZK-SNARKs, ZK-STARKs (age / membership / residency proofs)
- **HSM:** PKCS#11, AWS KMS, Azure Key Vault, GCP KMS
- **Libraries:** @noble/post-quantum, jose, argon2, snarkjs, circomlib

### Frameworks & Libraries

- Express.js 5+ (HTTP server)
- Apollo Server (GraphQL Federation)
- Socket.io + Redis adapter (WebSocket)
- Mongoose (MongoDB ODM)
- ioredis (Redis client)
- BullMQ (job queue for webhooks, OTP, cleanup)
- simplewebauthn (WebAuthn / FIDO2)
- samlify (SAML 2.0 SP)

### Data Stores

- MongoDB 7 (primary DB, 3-node replica set, transactions)
- Redis 7 (cache, rate limiting, pub/sub, locks, streams)
- AWS S3 / GCS (encrypted backup storage, audit archive)
- Elasticsearch (audit search / analytics)

### Secret Management (Updated)

- SecretProvider abstraction (Env / File / Chain / Vault / KMS)
- HashiCorp Vault, AWS Secrets Manager, Azure Key Vault
- Kubernetes Secrets (mounted volumes, not env vars)
- Rotation: automated, per-secret policy

### Observability

- Prometheus + Grafana (metrics and dashboards)
- OpenTelemetry → Jaeger (distributed tracing)
- Loki (log aggregation)
- Sentry (error tracking)
- Alertmanager (routing, silencing)

### Infrastructure

- Docker + Distroless base images
- Kubernetes (EKS / AKS / GKE) + Helm charts
- Terraform (IaC) + Terraform provider for Pezhwan resources
- GitHub Actions (CI/CD) with security gates
- PgBouncer-equivalent Mongo connection pooling

---

## 14. Architecture Summary (Updated)

| Aspect                          | Design Choice                                   | Rationale                                            |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| **Modular Monorepo**            | npm workspaces                                  | Code sharing, versioning, single build               |
| **Package Layering**            | Strict dependency direction                     | Clear boundaries, testability                        |
| **Crypto Agility**              | Config-driven algorithm selection               | Zero-downtime migration to PQC via env var           |
| **Hybrid PQC**                  | RS256 + ML-DSA-65 JWT signing                   | NIST + BSI recommended defense-in-depth              |
| **Hybrid KEM**                  | X25519 + ML-KEM-768 for session secrets         | Post-quantum confidentiality for harvest-now attacks |
| **Edge Verification**           | JWKS cached at CDN, kid-keyed                   | 50k RPS verify, 95%+ origin offload                  |
| **Stateless Core**              | JWT with local verification                     | Horizontal scaling, no session lookup                |
| **Stateful Operations**         | MongoDB replica set + transactions              | Durability, auditability, atomic rotation            |
| **Redis as Cache**              | Performance accelerator, never gate             | Reduces DB load, distributed limits                  |
| **Strict Audit Ordering**       | Atomic sequence + transaction                   | No forks under HA writers                            |
| **Fail-Closed Security**        | No identity on uncertainty                      | Security over availability                           |
| **Secret Provider Abstraction** | Vault/KMS/Env/File behind interface             | Swappable without code change                        |
| **Multi-Language SDKs**         | 7+ languages, published to registries           | Developer adoption, ecosystem                        |
| **Enterprise Features**         | ABAC, SCIM, SAML, Webhooks, Teams               | Enterprise requirements                              |
| **Observability**               | Prometheus + OTEL + Loki                        | Full request lifecycle visibility                    |
| **Multi-Region Active-Active**  | 3+ regions, global revocation < 2s              | Global reach, resilience                             |
| **Rate Limiting**               | Distributed, fail-closed on Redis outage        | Strong multi-instance abuse protection               |
| **MFA Depth**                   | TOTP + WebAuthn + backup codes + trusted device | Defense in depth for account takeover                |

---

## Key Architectural Improvements in This Revision

1. **Crypto agility is now a first-class architectural concern** — every algorithm is a config value; a "Crypto-Agility Guard" middleware prevents hardcoded algorithms from entering the codebase.

2. **Hybrid PQC is the default signing mode** — every JWT carries two signatures (RS256 + ML-DSA-65); both must verify. JWKS publishes both classical and PQC keys with separate `kid`s.

3. **Edge verification layer** is now explicit in the system context — the origin server only sees writes and cache misses, unlocking 50k RPS verification at the edge.

4. **Audit log has strict ordering** via an `AuditSequence` model and transactional writes — no more best-effort chain that can fork under HA.

5. **Refresh rotation is fully transactional** — the session rotation uses MongoDB transactions with `snapshot` read concern and `majority` write concern, eliminating the orphaned-session crash window.

6. **Secrets are abstracted behind `SecretProvider`** — the same application code works with env vars (dev), file mounts (K8s), or Vault/KMS (production) without modification.

7. **Rate limiting is distributed and fail-closed** — the security posture does not degrade when Redis is unavailable; the choice is explicit and documented.

8. **Multi-region is active-active** with global session revocation propagating in under 2 seconds via Redis Pub/Sub plus MongoDB change streams.

9. **Observability includes crypto algorithm labels** — `algorithm=hybrid-RS256-MLDSA65` is visible in every metric and trace, enabling measurement of PQC adoption.

10. **Zero-knowledge proofs** are integrated for privacy-preserving scenarios (age verification, group membership, residency) without revealing underlying attributes.

11. **HSM/KMS is a first-class key backend** — the `KeyStore` interface accepts a `HsmProvider`, and private key material never appears in application memory.

12. **Compliance is architecturally embedded** — GDPR/HIPAA/PCI/SOC2/CCPA services are part of the core layer, not bolted on.

---
