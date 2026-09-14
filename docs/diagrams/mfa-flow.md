# MFA Flow

TOTP enrollment, MFA-gated login, and disable flow.

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Express Routes
    participant E as AuthEngine
    participant M as MfaService
    participant U as UserModel
    participant T as TokenService
    participant A as AuditService

    rect rgb(232, 245, 233)
    Note over C,A: 1. MFA Enrollment (TOTP Setup)
    C->>R: POST /v1/mfa/setup (authenticated)
    R->>E: setupMfa({ userId, tenantId })
    E->>M: generateSecret() → base64 TOTP secret
    M->>U: store mfaSecret (select:false)
    M-->>R: { secret, otpauthUrl, backupCodes }
    R-->>C: QR code + backup codes displayed

    C->>R: POST /v1/mfa/enable { code }
    R->>E: enableMfa({ userId, code })
    E->>M: verify TOTP code (constant-time, RFC 6238)
    M->>U: mfaEnabled = true
    E->>A: MFA_ENABLED
    E-->>R: { enabled: true }
    R-->>C: 200 OK
    end

    rect rgb(227, 242, 253)
    Note over C,A: 2. MFA-Gated Login
    C->>R: POST /v1/auth/login { email, password }
    R->>E: loginPassword()
    E->>E: verifyPassword ✓ → checkMFA
    E-->>R: { mfaRequired: true, userId }
    R-->>C: 200 (no tokens yet)

    C->>R: POST /v1/mfa/login { userId, code }
    R->>E: verifyMfaLogin()
    E->>M: verify TOTP or backup code
    alt Valid TOTP
        M-->>E: verified
    else Valid backup code
        M->>U: mark backup code used
        M-->>E: verified
    else Invalid
        M-->>E: rejected (attempt count++)
        E-->>R: 401 MFA verification failed
    end
    E->>T: signAccessToken + signRefreshToken
    E->>A: LOGIN_SUCCESS
    E-->>R: { user, accessToken, refreshToken }
    R-->>C: 200 OK
    end

    rect rgb(255, 243, 224)
    Note over C,A: 3. MFA Disable
    C->>R: POST /v1/mfa/disable { code }
    R->>E: disableMfa({ userId, code })
    E->>M: verify currently-valid TOTP or backup code
    M-->>E: verified (required — cannot disable without proving possession)
    E->>U: mfaEnabled = false, mfaSecret = null
    E->>A: MFA_DISABLED
    E-->>R: { disabled: true }
    R-->>C: 200 OK
    end
```

## Key Security Properties

| Property                                   | Implementation                                                        |
| ------------------------------------------ | --------------------------------------------------------------------- |
| TOTP algorithm                             | RFC 6238, 30s step, ±1 skew, 6 digits                                 |
| Constant-time compare                      | `packages/crypto/src/totp.ts:126`                                     |
| Backup codes                               | SHA-256 hashed, single-use unique `codeHash`                          |
| TOTP secret at rest                        | Base64 stored (unhashed — required for verify), `select:false`        |
| Disable requires valid code                | `mfa.service.ts:194-211` — cannot disable without proof of possession |
| Brute-force protection                     | Per-user attempt counter + 15-min lock on user document               |
| Login never mints tokens while MFA enabled | `auth/auth.engine.ts:311-321,409-419`                                 |
