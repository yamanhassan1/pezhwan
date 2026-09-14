# Refresh Token Rotation

Transactional, single-use rotation with reuse detection and family revocation.

```mermaid
sequenceDiagram
    participant C as Client
    participant R as Express Routes
    participant S as SessionService
    participant M as MongoDB
    participant Re as Redis

    C->>R: POST /v1/auth/refresh { refreshToken }
    R->>S: rotate(refreshToken, { tenantId?, applicationId? })
    S->>S: hash = SHA-256(refreshToken)

    S->>M: findOneAndUpdate({ hash, status:'active' } → 'rotating') [atomic claim]

    alt Claim failed — session already consumed
        S->>M: find by hash — settled status?

        alt Status is 'replaced' or 'revoked' or 'expired'
            Note over S: REUSE DETECTION
            S->>M: revokeFamily(familyId) — revoke entire chain
            S->>Re: evict every cached liveness marker for family
            S-->>R: SessionError REFRESH_TOKEN_REUSE (401)
            R-->>C: 401 — family revoked
        else Status is 'rotating' (in-flight)
            Note over S: FAIL CLOSED — concurrent race
            S-->>R: SessionError (loser gets no token)
            R-->>C: 401 — contention
        end

    else Claim succeeded — exactly one winner
        S->>M: create child session (same familyId, new hash) [tx]
        S->>M: update parent → status 'replaced', replacedBySessionId = child
        S->>Re: liveness cache refreshed for parent + child
        S-->>R: { accessToken, refreshToken }
        R-->>C: 200 OK with rotated tokens
    end
```

## Session Lifecycle State Diagram

```mermaid
stateDiagram-v2
    [*] --> active: SessionService.create()

    active --> rotating: findOneAndUpdate (atomic claim)
    rotating --> replaced: Child session created [tx commit]
    rotating --> rotating: Loser of concurrent race [fail closed]

    replaced --> [*]
    revoked --> [*]
    expired --> [*]

    active --> revoked: revoke() / revokeFamily()
    active --> expired: TTL exceeded (cron / lazy)
    rotating --> revoked: revokeFamily() on reuse detection
    replaced --> revoked: revokeFamily() cascading

    note right of active
        Status: active
        currentRefreshTokenHash set
        liveness cached in Redis (30s)
    end note

    note right of rotating
        Status: rotating
        Transient — parent claimed
        Concurrent presents → only 1 wins
    end note

    note right of replaced
        Status: replaced
        replacedBySessionId = child
        parent token hash invalidated
    end note

    note right of revoked
        Status: revoked
        Explicit revocation
        Redis markers evicted
    end note
```

## Family Chain Visualization

```mermaid
flowchart LR
    A["Session A<br/>familyId: abc<br/>status: replaced"] -->|"replacedBy"| B["Session B<br/>familyId: abc<br/>status: replaced"]
    B -->|"replacedBy"| C["Session C<br/>familyId: abc<br/>status: active"]

    style A fill:#ffcdd2,stroke:#c62828
    style B fill:#fff9c4,stroke:#f57f17
    style C fill:#c8e6c9,stroke:#2e7d32

    R["Replay Session A<br/>→ reuse detected"] -.->|"revokeFamily(abc)"| A
    R -.->|"revokeFamily(abc)"| B
    R -.->|"revokeFamily(abc)"| C

    style R fill:#f44336,color:#fff,stroke:#b71c1c
```

Key invariants:

- **Only SHA-256 hashes** of refresh tokens are stored (`session.model.ts`)
- Atomic `active → rotating` claim serializes concurrent presentations to **exactly one winner**
- MongoDB transactions wrap child creation + parent finalization
- Redis liveness markers (30s TTL) provide cheap `isSessionActive` checks
- `revokeFamily` evicts all cached markers for the entire chain
