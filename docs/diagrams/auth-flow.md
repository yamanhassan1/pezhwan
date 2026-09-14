# Authentication Flows

## Login (Password + MFA Gate)

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Express Routes
    participant E as AuthEngine
    participant U as UserModel
    participant S as SessionService
    participant T as TokenService
    participant A as AuditService
    participant M as MongoDB
    participant Re as Redis

    Note over R: Middleware pipeline:<br/>requestContext → securityHeaders<br/>→ corsAllowlist → createAuthenticate<br/>→ csrfProtection → rateLimit

    C->>R: POST /v1/auth/login { email, password }
    R->>E: loginPassword({ tenantId, applicationId, device })
    E->>U: findOne({ tenantId, email }) [tenant-scoped]
    E->>E: verify Argon2id hash (rejects non-Argon2)
    E->>E: Lockout check — 5 fails → loginLockUntil 15m

    alt Account locked
        E-->>R: ACCOUNT_LOCKED { retryAfterMs }
        R-->>C: 401 error envelope
    else Account active
        E->>E: checkAccountState (isActive, tokenVersion)
        E->>E: MFA enabled?

        alt MFA enabled
            E-->>R: { mfaRequired: true, userId }
            R-->>C: 200 (no tokens yet)
            C->>R: POST /v1/mfa/login { userId, code }
            R->>E: verifyMfaLogin (TOTP / backup code, constant-time)
        else MFA disabled
            Note over E: Continue to session creation
        end

        E->>S: create() — new refresh family
        S->>M: SessionModel.create (status 'active', new familyId)
        S->>Re: cache session liveness key (30s TTL)
        E->>T: signAccessToken (RS256, kid, tenantId, tokenVersion)
        E->>T: signRefreshToken (random, SHA-256 hash stored)
        E->>A: AUDIT LOGIN_SUCCESS
        E-->>R: { user, accessToken, refreshToken }
        R-->>C: 200 OK with tokens
    end
```

## Register

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Express Routes
    participant E as AuthEngine
    participant S as SessionService
    participant T as TokenService
    participant M as MongoDB
    participant A as AuditService

    C->>R: POST /v1/auth/register { email, phone?, password }
    R->>E: register({ tenantId, applicationId, device })
    E->>E: validate identity handle
    E->>E: evaluatePassword against policy
    E->>E: hashPassword (Argon2id)
    E->>M: UserModel.create({ tenantId, email, ... })
    E->>S: create({ userId, tenantId, applicationId, device })
    S->>M: SessionModel.create (status 'active', new familyId)
    E->>T: signAccessToken (RS256, kid, exp)
    E->>A: USER_REGISTERED
    E-->>R: { user, accessToken, refreshToken }
    R-->>C: 201 Created
```

Note: Duplicate email returns 400 validation envelope without distinguishing "exists" from other policy failures (enumeration-safe).

## OTP Login (Passwordless)

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Express Routes
    participant O as OtpService
    participant E as AuthEngine
    participant S as SessionService
    participant M as MongoDB

    C->>R: POST /v1/auth/otp/send { channel, target, purpose }
    R->>O: request({ tenantId, applicationId, channel, target, purpose })
    O->>M: OTP record (one live code per key, 5m TTL)
    O->>O: deliver via email/SMS provider
    O-->>R: { success: true }
    R-->>C: 200 (enumeration-safe)

    C->>R: POST /v1/auth/otp/login { channel, target, code }
    R->>O: verify (constant-time SHA-256 compare)
    O->>M: check attempt count (≤5)
    O->>O: MFA enabled? → gate or complete
    O->>E: completeLogin()
    E->>S: create() → new refresh family
    E-->>R: { user, accessToken, refreshToken }
    R-->>C: 200 OK
```
