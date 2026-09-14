# Data Model — ER Diagram

Core entities and their relationships. Every entity is tenant-scoped.

```mermaid
erDiagram
    Tenant ||--o{ Application : "owns"
    Tenant ||--o{ User : "contains"
    Tenant ||--o{ Role : "defines"
    Tenant ||--o{ OAuthClient : "owns"
    Tenant ||--o{ AuditLog : "records"
    Tenant ||--o{ Webhook : "delivers"
    Tenant ||--o{ ABACPolicy : "defines"
    Tenant ||--o{ Subscription : "bills"
    Tenant ||--o{ Organization : "contains"
    Tenant ||--o{ TenantQuota : "quotas"

    Application ||--o{ User : "scopes"
    Application ||--o{ Session : "scopes"
    Application ||--o{ OAuthClient : "belongs to"

    User ||--o{ Session : "owns"
    User ||--o{ WebAuthnCredential : "registers"
    User ||--o{ BackupCode : "stores"
    User ||--o{ RiskEvent : "produces"
    User ||--o{ TrustedDevice : "uses"
    User ||--o{ ApiKey : "creates"

    OAuthClient ||--o{ AuthorizationCode : "issues"
    Webhook ||--o{ WebhookDelivery : "targets"

    Tenant {
        string id PK
        string name
        string slug UK
        bool isActive
        object config
        date createdAt
    }

    Application {
        string id PK
        string tenantId FK
        string clientId UK
        string clientSecretHash
        string[] redirectUris
        string platform
        object settings
    }

    User {
        string id PK
        string tenantId FK
        string applicationId FK
        string email
        string phone
        string passwordHash
        int tokenVersion
        bool mfaEnabled
        string mfaSecret
        bool isActive
        int failedLoginAttempts
        date loginLockUntil
    }

    Session {
        string id PK
        string userId FK
        string tenantId FK
        string applicationId FK
        string familyId
        string currentRefreshTokenHash
        string status
        date expiresAt
        date lastActiveAt
        string replacedBySessionId
        object metadata
    }

    Role {
        string id PK
        string tenantId FK
        string name
        string[] permissions
        string description
        int priority
    }

    Permission {
        string id PK
        string tenantId FK
        string name
        string resource
        string[] actions
        object conditions
    }

    OAuthClient {
        string id PK
        string tenantId FK
        string clientId UK
        string clientSecretHash
        string[] redirectUris
        string[] scopes
        string[] grants
        bool isConfidential
    }

    AuthorizationCode {
        string id PK
        string tenantId FK
        string codeHash UK
        string clientId FK
        string redirectUri
        string codeChallenge
        string codeChallengeMethod
        string userId FK
        date usedAt
        date expiresAt
    }

    AuditLog {
        string id PK
        string tenantId FK
        int sequence
        string eventType
        string userId
        object data
        string prevHash
        string hash
        date timestamp
    }

    Webhook {
        string id PK
        string tenantId FK
        string url
        string[] events
        string secretHash
        string status
        object retryConfig
    }

    WebhookDelivery {
        string id PK
        string webhookId FK
        string eventId
        string status
        int attempts
        date deliveredAt
    }

    WebAuthnCredential {
        string id PK
        string userId FK
        string credentialId UK
        string publicKey
        int counter
        string[] transports
        string deviceName
    }

    BackupCode {
        string id PK
        string userId FK
        string codeHash
        bool used
        date usedAt
    }

    ApiKey {
        string id PK
        string tenantId FK
        string userId FK
        string keyHash UK
        string name
        string[] scopes
        date expiresAt
        bool isActive
    }

    Organization {
        string id PK
        string tenantId FK
        string name
        string parentId FK
        string type
        object metadata
    }

    Subscription {
        string id PK
        string tenantId FK
        string plan
        string status
        object usage
        object limits
        date currentPeriodEnd
    }

    TenantQuota {
        string id PK
        string tenantId FK
        int userLimit
        int sessionLimit
        int apiKeyLimit
        int oauthClientLimit
        int webhookLimit
        int storageBytes
        object usage
    }
```

## Key Indexes

| Model             | Unique/Compound Index                  | Purpose                           |
| ----------------- | -------------------------------------- | --------------------------------- |
| User              | `{ tenantId, email }` (sparse)         | Tenant-scoped login lookup        |
| User              | `{ tenantId, phone }` (sparse)         | Tenant-scoped phone login         |
| Session           | `{ currentRefreshTokenHash }` (unique) | One-time-use refresh token lookup |
| Session           | `{ familyId }`                         | Family revocation on reuse        |
| OAuthClient       | `{ tenantId, clientId }`               | Tenant-scoped client lookup       |
| AuthorizationCode | `{ codeHash }` (unique)                | Single-use code redemption        |
| AuditLog          | `{ tenantId, sequence }`               | Ordered audit chain               |
| ApiKey            | `{ keyHash }` (unique)                 | Global API key lookup             |
| BackupCode        | `{ codeHash }` (unique)                | Single-use backup code            |
