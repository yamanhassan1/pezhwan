# OAuth 2.1 / OIDC Authorization Code + PKCE Flow

```mermaid
sequenceDiagram
    participant C as Client (Browser/SPA)
    participant E as Express Routes
    participant O as OAuthService
    participant S as SessionService
    participant T as TokenService
    participant M as MongoDB
    participant IDP as External IdP (Google/GitHub)

    rect rgb(232, 245, 233)
    Note over C,M: Authorization Code + PKCE (S256)
    C->>C: Generate code_verifier + code_challenge (S256)
    C->>E: GET /v1/oauth/authorize?client_id&redirect_uri<br/>&response_type=code&scope=openid<br/>&state&nonce&code_challenge&code_challenge_method=S256
    E->>O: validateAuthorizeRequest()
    O->>M: find OAuthClient by clientId
    O->>O: exact redirect_uris match
    O->>O: PKCE required for public clients (S256 only)
    O->>O: scope containment check
    O->>M: AuthorizationCode.create({ codeHash, codeChallenge, userId })
    O-->>C: 302 Location: redirect_uri?code=...&state=...
    end

    rect rgb(227, 242, 253)
    Note over C,M: Token Exchange
    C->>E: POST /v1/oauth/token<br/>grant_type=authorization_code<br/>&code&code_verifier&client_id
    E->>O: exchangeCode()
    O->>M: findOneAndUpdate({ codeHash, consumedAt: null }) [atomic redeem]
    O->>O: constant-time S256 verify(code_verifier vs codeChallenge)
    O->>S: createSession() → refresh family
    O->>T: signAccessToken + id_token
    O->>M: AuditService.log()
    O-->>C: { access_token, refresh_token, id_token, scope, expires_in }
    end

    rect rgb(255, 243, 224)
    Note over C,M: Federation (External IdP)
    C->>E: GET /v1/oauth/authorize?...&idp=google
    E->>O: initiateFederation('google')
    O-->>C: 302 → Google OAuth consent screen
    C->>Google: User consents
    Google-->>C: 302 → redirect_uri?code=ext_code
    C->>E: POST /v1/oauth/token { code, ... }
    E->>O: exchangeFederatedCode()
    O->>Google: exchangeAuthorizationCode() [server-to-server]
    Google-->>O: { access_token, id_token, profile }
    O->>O: upsertUser(profile, tenantId)
    O->>S: createSession() → refresh family
    O->>T: signAccessToken + id_token
    O-->>C: { access_token, refresh_token, id_token }
    end
```

## Key Security Properties

| Property                  | Implementation                                                                 |
| ------------------------- | ------------------------------------------------------------------------------ |
| Authorization code replay | Single-use atomic `findOneAndUpdate` on `consumedAt: null` + unique `codeHash` |
| PKCE enforcement          | Public clients **require** `code_challenge` S256 (`oauth.service.ts:141`)      |
| PKCE failure              | Bound session is revoked (security event)                                      |
| Redirect URI tampering    | Exact match against registered `redirect_uris`                                 |
| Client secret storage     | SHA-256 hashed, never plaintext (`oauth.service.ts:177`)                       |
| Token audience            | Audience-scoped (`pezhwan.clients`), `tenantId` + `kid` carried                |
| Constant-time compare     | S256 verification uses `timingSafeEqual`                                       |
