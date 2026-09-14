# Zero-trust architecture

Pezhwan applies zero-trust principles to its identity and access management
stack. The core axiom: **never trust network location, always verify identity,
and grant least privilege per request.**

---

## 1. Never trust network location (fail-closed)

No assumption is made that an internal port or known IP is legitimate. Every
request must carry a verifiable credential.

- `createAuthenticate` fails closed: no identity is attached unless
  `accountState.validate(userId, tokenVersion)` succeeds —
  `packages/express/src/index.ts:66-75`
- When MongoDB is unreachable the middleware returns **503** (never a
  misleading 401), so dependency failure never silently grants access — G4
- Redis outages degrade to bounded in-memory caches; the system never falls
  back to trusting unverifiable tokens

## 2. Verify identity per request

- **Access token**: issuer, audience, expiry, algorithm (RS256 pinned), and
  `kid` verified — `packages/crypto/src/jwt.ts:202-205`
- **Account state**: the JWT `tokenVersion` must match durable state, so
  tokens issued before a password change, role change, or disable are rejected —
  `accountState.service.ts:21,50-70`
- **Tenant context**: the token `tenantId` must match the runtime engine
  context — `auth/auth.engine.ts:96-105`
- Roles/permissions ride in the JWT and are authoritative for its 15-min TTL;
  immediate revocation is via `tokenVersion` bump (documented trade-off)

## 3. Least privilege (deny-by-default)

- Authorization is evaluated server-side per request; request bodies, headers,
  and JWT custom claims cannot grant privileges — `docs/security/authorization.md`
- RBAC policy denies by default; ABAC conditions are evaluated server-side
  against trusted attribute sources
- Administrative routes require `requireRole('ADMIN')`
- Resource lookups constrain both the authenticated subject and
  tenant/application scope

## 4. Tenant isolation as micro-segmentation

Each tenant is a logical trust boundary within shared infrastructure:

- All user queries embed `tenantId` (`findOne({ _id, tenantId })`, never
  unscoped `findById`) — `auth/auth.engine.ts:96-105,987-1000`
- Per-tenant unique indexes `{tenantId, email}` / `{tenantId, phone}` —
  `user.model.ts:75-78`; sessions tenant-scoped — `session.model.ts:39`
- Access tokens carry `tenantId` verified per request — `token.service.ts:78,184`
- Cross-tenant refresh raises `SESSION_CONTEXT_INVALID`; API keys are globally
  unique and the assigned tenant is never caller-supplied — `apiKey.service.ts:51-58`

## 5. Nothing in plaintext secrets

- **Passwords**: Argon2id (timeCost 3, memoryCost 64 MiB, parallelism 1); only
  `passwordHash` stored — `packages/crypto/src/password.ts:23-28`
- **Tokens/codes**: all high-entropy secrets stored SHA-256 hashed — refresh
  tokens, OAuth codes, client secrets, API keys, OTPs, backup codes —
  `THREAT-MODEL.md` 2
- **Comparison**: constant-time `timingSafeEqual` everywhere —
  `token.service.ts:209-218`
- **Logs**: structured logger redacts `password, token, secret, code, totp…` —
  `logger.service.ts:19-37`; HTTPS issuer enforced in production

## 6. Continuous verification

Trust is continuously re-evaluated, never granted once:

- **Session TTL**: idle and absolute expiry enforced server-side
- **Refresh rotation**: every refresh mints a new pair; reuse revokes the whole
  session family — `session.service.ts:115-182`
- **Token version**: password/role change or admin action bumps `tokenVersion`,
  invalidating outstanding tokens — `auth/auth.engine.ts:624-683,765-777`
- **Risk-based auth**: every login is scored (impossible travel, breach match,
  velocity, bot score); high-risk logins step up to MFA — `risk.service.ts`

## 7. Audit everything

Auth, MFA, password, role, admin, and compliance actions are audited with
actor, source, target, result, and correlation ID. Entries form a `prevHash`
SHA-256 chain; writes never block authentication — `audit.service.ts:38-59`.
Risk events persist signals and verdict per scored login — `risk.service.ts:136-167`.

## 8. Trusted infrastructure boundary

| Component           | Boundary                                                           |
| ------------------- | ------------------------------------------------------------------ |
| MongoDB             | Network-isolated; clients never reach it directly; durable source  |
| Redis               | Network-isolated; optimizer only, never authoritative              |
| Signing key storage | Filesystem/secret mount; private keys never leave the KeyStore     |
| Reverse proxy / TLS | TLS terminated upstream; Pezhwan validates the proxied certificate |

Deployments that place Mongo/Redis outside this boundary need additional
controls (field-level encryption, network policy).

## 9. Documented carve-outs

| Carve-out                        | Status      | Mitigation                                                                                       |
| -------------------------------- | ----------- | ------------------------------------------------------------------------------------------------ |
| TOTP secret at rest              | Accepted    | `mfaSecret` base64 + `select:false`; envelope encryption documented for out-of-boundary DBs — G3 |
| Audit hash chain in HA           | Best-effort | `prevHash` may fork under concurrent writers; single-writer shard needed — G7                    |
| Roles in access-token JWT        | Trade-off   | Authoritative for 15-min TTL; immediate revocation via `tokenVersion`                            |
| Rate limit on Redis outage       | Trade-off   | Per-process counter; availability over strictness                                                |
| Session liveness cache staleness | Trade-off   | 30-s cache; authoritative Mongo check underneath                                                 |
