# PEZHWAN — Enterprise + Quantum-Safe Production Implementation Prompt

## Mission

Take PEZHWAN from **7.4/10** to a **10/10**, **quantum-ready**, **horizontally scalable**, **production-grade** IAM platform. This prompt fixes the 8 release blockers, adds all enterprise features, and hardens cryptography against both classical and quantum adversaries using **hybrid post-quantum cryptography (PQC)**.

Every task is measurable, reversible, and tied to an acceptance test. No task is complete until it passes in CI.

---

# PART A — CRYPTOGRAPHIC AGILITY & POST-QUANTUM CRYPTOGRAPHY

## A.1 — Why PQC Must Land First

JWTs, refresh tokens, API keys, OAuth codes, and audit hashes are all harvested today by attackers for "**harvest now, decrypt later**" attacks. NIST finalized its PQC standards in 2024:

| Standard | Algorithm                   | Purpose               |
| -------- | --------------------------- | --------------------- |
| FIPS 203 | ML-KEM (CRYSTALS-Kyber)     | Key encapsulation     |
| FIPS 204 | ML-DSA (CRYSTALS-Dilithium) | Digital signatures    |
| FIPS 205 | SLH-DSA (SPHINCS+)          | Hash-based signatures |

NIST SP 1800-38C tests both **PQC-only** and **hybrid** modes. The BSI (German Federal Office for Information Security) recommends **hybrid implementations** — combining classical + PQC — during the migration window.

**PEZHWAN's target:** hybrid signatures (`RS256 + ML-DSA-65`) for JWTs, hybrid KEM for any session key exchange, and full crypto agility so algorithms can be swapped via config without code changes.

---

## A.2 — Externalize All Cryptographic Algorithms

**Problem:** Hardcoded algorithms create migration debt. Every change requires editing, rebuilding, redeploying.

**Action:**

Add a crypto config block to `packages/core/src/config/env.ts`:

```typescript
crypto: z.object({
  jwtSigningAlgorithm: z
    .enum([
      'RS256',
      'ES256',
      'EdDSA',
      'ML-DSA-65',
      'ML-DSA-87',
      'hybrid-RS256-MLDSA65',
      'hybrid-ES256-MLDSA65',
    ])
    .default('RS256'),
  keyEncapsulationAlgorithm: z
    .enum(['RSA-OAEP', 'ECDH', 'ML-KEM-768', 'ML-KEM-1024', 'hybrid-X25519-MLKEM768'])
    .default('RSA-OAEP'),
  tokenHashAlgorithm: z.enum(['sha256', 'sha512', 'sha3-256']).default('sha256'),
  auditHashAlgorithm: z.enum(['sha256', 'sha3-256']).default('sha256'),
  passwordHashParams: z
    .object({
      algorithm: z.literal('argon2id'),
      memoryCost: z.number().default(65536),
      timeCost: z.number().default(3),
      parallelism: z.number().default(1),
    })
    .default({}),
});
```

**Audit and fix every hardcoded algorithm:**

| File                                                | Replace                                         |
| --------------------------------------------------- | ----------------------------------------------- |
| `packages/crypto/src/jwt.ts`                        | `'RS256'` → `config.crypto.jwtSigningAlgorithm` |
| `packages/crypto/src/password.ts`                   | params → `config.crypto.passwordHashParams`     |
| `packages/core/src/models/user.model.ts`            | `sha256` → `config.crypto.tokenHashAlgorithm`   |
| `packages/core/src/services/audit/audit.service.ts` | `sha256` → `config.crypto.auditHashAlgorithm`   |

**Acceptance:**

- `grep -r "getInstance(\"RSA\")" packages/` returns zero results
- Changing `PEZHWAN_JWT_SIGNING_ALGORITHM=ML-DSA-65` changes signing without code changes
- A crypto-agility test asserts no algorithm literal appears in non-config source

---

## A.3 — Implement Hybrid Post-Quantum JWT Signing

**Install:**

```bash
npm install --save @noble/post-quantum
```

**Create `packages/crypto/src/pq/`:**

| File                | Purpose                                         |
| ------------------- | ----------------------------------------------- |
| `kyber.ts`          | ML-KEM-768/1024 encapsulation                   |
| `dilithium.ts`      | ML-DSA-65/87 sign/verify                        |
| `sphincs.ts`        | SLH-DSA (hash-based, for long-term backup keys) |
| `hybrid.ts`         | Combined RSA-2048 + ML-DSA-65 signing           |
| `key-serializer.ts` | PEM/DER encoding for PQC keys                   |

**Extend `packages/crypto/src/jwt.ts`:**

```typescript
export interface HybridSignature {
  classical: string; // base64url RSA-2048 signature
  pqc: string; // base64url ML-DSA-65 signature
}

export async function signHybrid(payload, keys): Promise<string> {
  const [classical, pqc] = await Promise.all([
    signClassical(payload, keys.classical),
    signMlDsa(payload, keys.pqc),
  ]);
  // JWT header: { alg: 'hybrid-RS256-MLDSA65', kid, pqc_kid }
  // JWT body contains both signatures in a custom field
}

export async function verifyHybrid(token, jwks): Promise<Payload> {
  // Verify BOTH signatures; reject if either fails
}
```

**Update `KeyStoreService.generate()`:**

```typescript
async generate(): Promise<KeyPair> {
  return {
    kid: generateKid(),
    classical: await generateRSA(2048),
    pqc: await generateMlDsa65(),
    status: 'GENERATED',
    createdAt: new Date(),
  };
}
```

**Update JWKS endpoint to publish both:**

```json
{
  "keys": [
    { "kid": "k1", "alg": "RS256", "use": "sig", "n": "...", "e": "AQAB" },
    { "kid": "k1-pqc", "alg": "ML-DSA-65", "use": "sig", "pub": "..." }
  ]
}
```

**Performance baseline (from NIST testing):**

| Algorithm | Public Key | Signature | Sign (ms) | Verify (ms) |
| --------- | ---------- | --------- | --------- | ----------- |
| RSA-2048  | 294 B      | 256 B     | 0.5       | 0.1         |
| ML-DSA-65 | ~1,952 B   | ~3,309 B  | 16.5      | 3.2         |
| Hybrid    | ~2,246 B   | ~3,565 B  | 17.0      | 3.3         |

**Mitigation:** PQC signing happens only on login/refresh. PQC verification happens at the **edge** with cached JWKS (see Part B). No measurable latency impact on authenticated API calls.

**Acceptance:**

- Hybrid-signed JWT verifies only if BOTH signatures are valid
- Tampering with either signature rejects the token
- JWKS advertises both classical and PQC keys
- `tests/security/pqc-hybrid.test.ts` passes for tampering scenarios
- Signing throughput tested at 500 signs/sec per instance

---

## A.4 — Post-Quantum Key Encapsulation for Session Secrets

**Where used:**

- Wrapping refresh-token family keys
- Encrypting server-side session secrets before writing to Redis
- Encrypting OAuth authorization-code payloads

**Implement `hybrid-KEM`:**

```typescript
// 1. Client generates X25519 ephemeral + ML-KEM-768 keypair
// 2. Client sends both public keys to server
// 3. Server encapsulates: shared_secret = HKDF(x25519_secret || mlkem_secret)
// 4. Both sides derive the same key
```

**Config:** `PEZHWAN_KEY_ENCAPSULATION_ALGORITHM=hybrid-X25519-MLKEM768`

**Acceptance:**

- Round-trip encapsulate/decapsulate matches
- Tampered ciphertext rejected
- Hybrid is used by default in production config

---

## A.5 — Key Rotation with PQC Support

**Update `KeyStoreService.rotate()`:**

```typescript
async rotate(): Promise<KeyId> {
  const { classical, pqc } = await this.generateHybridKeyPair();
  const kid = generateKid();
  await this.persist({
    kid,
    classical: { alg: 'RS256', private, public },
    pqc: { alg: 'ML-DSA-65', private, public },
    status: 'STAGED',
  });
  return kid;
}
```

**State machine (already in architecture):**

```
GENERATED → STAGED → ACTIVE → VERIFY-ONLY → RETIRED → REVOKED
```

**PQC-specific rule:** A PQC key must remain `VERIFY-ONLY` for at least the maximum token lifetime (30 days) before `RETIRED`.

**Acceptance:**

- Rotation produces new kid visible in JWKS within 1 second
- Tokens with old kid still verify during `VERIFY-ONLY` window
- `scripts/verify-rotation.mjs` asserts zero downtime during rotation

---

## A.6 — Edge JWKS Caching for PQC Verification

PQC verification is CPU-heavier than RSA. Move it to the edge.

**Nginx `auth_request` pattern:**

```nginx
location /api/ {
  auth_request /auth/verify;
  proxy_pass http://identity-server;
}
location = /auth/verify {
  internal;
  proxy_pass http://identity-server/verify;
  proxy_pass_request_body off;
  proxy_set_header Authorization $http_authorization;
}
```

**Cloudflare Worker pattern:**

```javascript
// Cache JWKS in isolate memory + colo cache
const jwks = await getCachedJWKS(); // 10 min TTL
const key = jwks.keys.find((k) => k.kid === extractKid(token));
const valid = await verifyHybrid(token, key);
if (!valid) return new Response('Unauthorized', { status: 401 });
```

**Client-side cache key must be `kid`, not URL** — this survives rotation without full cache flush.

**Acceptance:**

- 50,000 RPS JWT verification at edge with p95 < 10ms
- Origin servers receive only writes (< 5% of traffic)
- Key rotation triggers one JWKS fetch per new kid

---

# PART B — RELEASE BLOCKERS (Weeks 1–4)

## B.1 — Live MongoDB/Redis Integration Suite

**Install:**

```bash
npm install --save-dev mongodb-memory-server testcontainers
```

**Create `tests/integration/setup.ts`** — boots a 3-node Mongo replica set + Redis container for the test suite.

**Create these tests:**

| File                       | Assertion                                                               |
| -------------------------- | ----------------------------------------------------------------------- |
| `auth-flow.test.ts`        | register → login → refresh → logout with DB state verified at each step |
| `session-rotation.test.ts` | 8 concurrent refreshes → exactly 1 success, 7 reuse-rejected            |
| `mfa-lockout.test.ts`      | 5 failed codes → 15-min lock; correct code rejected while locked        |
| `oauth-flow.test.ts`       | Full PKCE authorization-code exchange                                   |
| `tenant-isolation.test.ts` | Cross-tenant read/write/refresh all rejected                            |
| `rate-limits.test.ts`      | 429 with Retry-After on budget exhaustion                               |

**Acceptance:**

- All 6 integration tests pass locally and in CI in under 5 minutes
- No manual DB setup required

---

## B.2 — Backup/Restore Drill Automation

**Create `scripts/backup-drill.mjs`:**

Steps:

1. `mongodump` target database
2. Encrypt with `gpg --symmetric` using `DRILL_ENCRYPTION_KEY`
3. Compute SHA-256 checksum
4. Record dump size, duration, checksum, timestamp to `./drills/backup-<ts>/report.json`

**Create `scripts/restore-drill.mjs`:**

Steps:

1. Decrypt backup
2. Restore into isolated Docker MongoDB
3. Validate: index count, collection count, tenant isolation sample
4. Start identity-server with restored keys
5. Run smoke tests: register, login, refresh, verify JWT
6. Measure RTO
7. Write report with RPO/RTO/checksum/reviewer

**Add scripts:**

```json
"drill:backup": "node scripts/backup-drill.mjs",
"drill:restore": "node scripts/restore-drill.mjs",
"drill:full": "npm run drill:backup && npm run drill:restore"
```

**Acceptance:**

- Drill completes end-to-end in < 15 minutes
- All auth tests pass post-restore
- RPO < 24h, RTO < 1h documented

---

## B.3 — MongoDB Replica Set + Transactions

**Update `infrastructure/docker/docker-compose.yml`** with 3-node replica set + `mongo-init` container that runs `rs.initiate({...})`.

**Refactor `packages/core/src/services/session/session.service.ts` rotation:**

```typescript
async rotate(refreshToken, ctx) {
  const session = await this.claimForRotation(refreshToken, ctx); // atomic active→rotating
  const dbSession = await mongoose.startSession();
  try {
    return await dbSession.withTransaction(async () => {
      const child = await SessionModel.create([buildChild(session, ctx)], { session: dbSession });
      await SessionModel.updateOne(
        { _id: session._id, status: 'rotating' },
        { status: 'replaced', replacedBySessionId: child[0]._id },
        { session: dbSession },
      );
      return this.tokens.signPair(child[0], session.userId);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await dbSession.endSession();
  }
}
```

Add retry wrapper for `TransientTransactionError` (3 attempts, exponential backoff).

**Acceptance:**

- Concurrent refresh test still passes
- Crash between child creation and parent finalization leaves no orphaned session
- Integration tests run against 3-node replica set

---

## B.4 — MFA Legacy-Secret Migration

**Create `migrations/004-mfa-secrets-encryption.ts`:**

For each user with base64 `mfaSecret`:

1. Decode base64 → raw secret
2. Encrypt with AES-256-GCM using `MFA_ENCRYPTION_KEY`
3. Store as `{ iv, tag, ciphertext }`
4. Verify TOTP code still validates against migrated secret

Support `--dry-run` and `--batch-size`. Idempotent — skip already-migrated users.

**Create rollback** `migrations/rollback/004-mfa-secrets-rollback.ts` — reverse transformation, verified to produce valid TOTP.

**Update `mfa.service.ts`** to accept both formats during migration window via flag `PEZHWAN_MFA_LEGACY_FORMAT_ENABLED=true`.

**Acceptance:**

- Migration on 10k users completes < 5 min
- 100% sampled users verify TOTP post-migration
- Rollback restores base64 with valid TOTP

---

## B.5 — Real Email/SMS Provider Integration

**Create provider adapters** at `packages/core/src/adapters/email/` and `.../sms/`.

**Contract:**

```typescript
interface OtpDeliveryProvider {
  sendEmail(to: string, code: string): Promise<DeliveryResult>;
  sendSms(to: string, code: string): Promise<DeliveryResult>;
  healthCheck(): Promise<HealthStatus>;
}
```

**Implement:**

- `nodemailer.ts` (SMTP + TLS)
- `sendgrid.ts` (API v3)
- `aws-ses.ts` (SigV4)
- `twilio.ts`
- `aws-sns.ts`
- `mock.ts` (used in tests)

**Each provider:** exponential backoff (3 attempts), circuit breaker (5 failures → open 30s), 10s timeout.

**Wire into `/health/ready`:** return 503 if `otpDelivery.healthCheck() !== 'ok'`.

**Acceptance:**

- SendGrid + Twilio + AWS SES + AWS SNS all send real messages in staging
- Circuit breaker test opens on repeated failures
- Readiness fails when provider unhealthy

---

## B.6 — Redis Distributed Rate Limiting

**Decision required — document chosen strategy.**

**Strategy A — Fail closed (high-security):**

```typescript
try {
  const allowed = await rateLimiter.consume(key, budget);
  if (!allowed) return res.status(429).json(...);
  next();
} catch (err) {
  if (err instanceof SecurityDependencyError) {
    return res.status(503).json({ error: { code: 'RATE_LIMIT_UNAVAILABLE' } });
  }
  next(err);
}
```

**Strategy B — Redis Sentinel** with automatic failover.

**Strategy C — MongoDB fallback** using atomic `$inc`.

**Acceptance:**

- Chosen strategy documented in `docs/operations/rate-limiting-strategy.md`
- `tests/failure/redis-failure.test.ts` passes
- Multi-instance test shows shared counters

---

## B.7 — Audit Chain Strict Ordering

**Create `packages/core/src/models/audit-sequence.model.ts`:**

```typescript
const AuditSequenceSchema = new Schema({
  _id: { type: String, default: 'global' },
  sequence: { type: Number, required: true, default: 0 },
});
```

**Create `packages/core/src/services/audit/audit-writer.ts`:**

```typescript
async function writeAudit(entry: AuditEntryInput): Promise<AuditLog> {
  return mongoose.transaction(async (session) => {
    const seq = await AuditSequenceModel.findOneAndUpdate(
      { _id: 'global' },
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, session },
    );
    const prev = await AuditLogModel.findOne({}, null, { sort: { sequence: -1 }, session });
    const prevHash = prev?.hash ?? '0'.repeat(64);
    const hash = sha256(prevHash + JSON.stringify({ ...entry, sequence: seq.sequence }));
    return AuditLogModel.create([{ ...entry, sequence: seq.sequence, prevHash, hash }], {
      session,
    });
  });
}
```

**Create retention service** — configurable via `PEZHWAN_AUDIT_RETENTION_DAYS`, nightly job deletes old entries, archives to S3 if `PEZHWAN_AUDIT_ARCHIVE_BUCKET` set.

**Update threat model** §10 from "best-effort" to "strictly ordered via sequence + transaction".

**Acceptance:**

- 100 concurrent audit writes → strictly increasing sequence, no forks
- Retention job archives old entries
- `scripts/verify-audit-chain.mjs` reports OK

---

## B.8 — Zero-Knowledge Proofs

**Install:** `snarkjs`, `circomlib`.

**Create `packages/crypto/src/zk/`:**

| File                  | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `age-proof.ts`        | Prove age ≥ threshold without revealing birthdate    |
| `membership-proof.ts` | Prove group membership without revealing identity    |
| `residency-proof.ts`  | Prove country of residence without revealing address |
| `verifier.ts`         | Server-side proof verification                       |

**Add endpoint:** `POST /v1/auth/zk/verify`.

**Acceptance:**

- Age proof passes for `birthdate=2000-01-01, threshold=18`
- Membership proof passes for enrolled users only
- Verification completes in < 200ms

---

## B.9 — HSM Integration

**Create `packages/crypto/src/hsm/` with adapters:**

- `pkcs11.ts` (uses `pkcs11js`)
- `aws-kms.ts` (`@aws-sdk/client-kms`)
- `azure-keyvault.ts` (`@azure/keyvault-keys`)
- `gcp-kms.ts` (`@google-cloud/kms`)

**Interface:**

```typescript
interface HsmProvider {
  generateKeyPair(alg: string): Promise<KeyId>;
  sign(data: Buffer, keyId: KeyId): Promise<Buffer>;
  verify(data: Buffer, sig: Buffer, keyId: KeyId): Promise<boolean>;
  getPublicKey(keyId: KeyId): Promise<Buffer>;
  deleteKey(keyId: KeyId): Promise<void>;
}
```

**Refactor `KeyStoreService`** to accept `HsmProvider`. Config: `PEZHWAN_HSM_PROVIDER=pkcs11|aws-kms|azure|gcp|none`.

**Acceptance:**

- AWS KMS signing works end-to-end
- Private key material never appears in process memory (KMS API logs verify)
- Key rotation works via HSM

---

## B.10 — WebAuthn/FIDO2 Enterprise

**Install:** `@simplewebauthn/server`, `@simplewebauthn/types`.

**Create `webauthn.service.ts`:**

- `beginRegistration(userId)` → challenge + options
- `completeRegistration(userId, response)` → stores credential
- `beginAuthentication(userId?)` → challenge (discoverable allowed)
- `completeAuthentication(response)` → verify, update counter
- `listCredentials(userId)`, `renameCredential`, `deleteCredential`

**Model:** `webauthn-credential.model.ts` with `credentialId`, `publicKey`, `counter`, `transports`, `deviceName`, `backedUp`.

**Enforce:** counter must strictly increase; reject if not (cloning detection).

**Acceptance:**

- Passkey registration works in Chrome, Safari, Firefox
- YubiKey 5 works via USB + NFC
- Counter regression triggers alert

---

## B.11 — mTLS Certificate Authentication

**Create `certificate.service.ts`:**

- Parse X.509 from `req.socket.getPeerCertificate()`
- Verify against `PEZHWAN_MTLS_CA_BUNDLE`
- Check CRL/OCSP via `PEZHWAN_MTLS_OCSP_URL`
- Map SAN/CN to user via configurable rule

**Add middleware** in `packages/express/src/middleware.ts`.

**Support OAuth client certificate authentication** per RFC 8705.

**Acceptance:**

- mTLS-authenticated request attaches valid identity
- Expired cert rejected
- Revoked cert rejected (OCSP)

---

## B.12 — Account Takeover & Breach Detection

**Create `packages/core/src/services/security/`:**

**`risk.service.ts`** — 0–100 score:

- New device (+25)
- New country (+20)
- Impossible travel (>900 km/h) (+30)
- Unusual hour (+10)
- Recent failed attempts (+15)
- IP blocklist (+40)
- Tor exit node (+20)

Thresholds: `PEZHWAN_RISK_CHALLENGE=50`, `PEZHWAN_RISK_BLOCK=80`.

**`breach-detector.service.ts`:**

- 10+ failed logins from same IP in 5 min → credential stuffing alert
- Refresh reuse from different IP → token theft alert
- Off-hours admin escalation → suspicious activity alert

**`bot-detector.service.ts`** — headless heuristics + optional CAPTCHA gate.

**`decoy.service.ts`** — fake users with plausible data; login attempts alert.

**`hibp.service.ts`** — HIBP v3 K-Anonymity API; reject compromised passwords.

**Acceptance:**

- Risk score correct for 10 fixtures
- Impossible travel detected within 1 minute
- HIBP rejects known-breached password
- Decoy login fires alert within 10 seconds

---

## B.13 — Compliance Framework

**Create `packages/core/src/services/compliance/`:**

| Service            | Deliverable                                                         |
| ------------------ | ------------------------------------------------------------------- |
| `gdpr.service.ts`  | Export user data JSON; cascade delete; consent tracking             |
| `hipaa.service.ts` | PHI tagging + PHI-access audit with who/what/when/why; BAA tracking |
| `pci.service.ts`   | Card tokenization; separation of duties enforced                    |
| `soc2.service.ts`  | Immutable change log; access-control attestation                    |
| `ccpa.service.ts`  | Do Not Sell My Data; opt-out enforcement in all data-sharing paths  |

**Acceptance:**

- GDPR export < 30 seconds
- GDPR delete cascade removes all user rows
- CCPA opt-out honored by webhook and audit export paths
- HIPAA PHI audit complete for fixture scenario

---

# PART C — SCALABILITY & OPTIMIZATION (Weeks 3–6)

## C.1 — Edge Token Verification

Move JWT verification to nginx `auth_request` or Cloudflare Worker.

**Result:** Origin handles only writes; 50k RPS verification at edge.

**Acceptance:**

- 50k RPS JWT verification at edge, p95 < 10ms
- Origin CPU drop > 80% for read-heavy traffic

---

## C.2 — Connection Pooling

**MongoDB:**

```typescript
mongoose.connect(uri, {
  maxPoolSize: 25,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  waitQueueTimeoutMS: 5000,
});
```

**Redis:** connection pool via `ioredis` `maxRetriesPerRequest`.

**Expose metrics:**

- `pezhwan_db_pool_connections_active`
- `pezhwan_db_pool_waiting`

**Acceptance:**

- 10k concurrent clients multiplex onto 25 backends
- No connection timeouts under burst

---

## C.3 — Write-Behind `last_login_at` Updates

Buffer login timestamps in Redis Streams; drain to DB in batches.

```typescript
// Login success: XADD (non-blocking)
await redis.xadd('pezhwan:login_writes', '*', 'user_id', userId, 'ts', Date.now());

// Drainer (every 1s): XREADGROUP → collapse by user → single batch UPDATE → XACK
```

**Acceptance:**

- Login throughput unaffected by `last_login_at` write latency
- 500 entries collapse to ≤1 DB round trip
- `XAUTOCLAIM` recovers stuck entries

---

## C.4 — JWKS Edge Caching with kid-Based Invalidation

Cache JWKS with `Cache-Control: public, max-age=600`. Client cache key is `kid`, not URL.

**Acceptance:**

- First request fetches JWKS; 10k subsequent verify locally with zero round trips
- Rotation triggers one fetch for the new kid
- Old tokens keep verifying until expiry

---

## C.5 — Health Checks & Graceful Shutdown

**Endpoints:**

- `/health/live` — process alive
- `/health/ready` — Mongo + Redis + signing keys + OTP provider ready

**Shutdown:**

```typescript
process.on('SIGTERM', async () => {
  server.close();
  await drainConnections(30_000);
  await mongoose.disconnect();
  await redis.disconnect();
  process.exit(0);
});
```

**Acceptance:**

- Liveness never fails during normal ops
- Readiness fails when Mongo unreachable
- SIGTERM causes zero dropped requests

---

## C.6 — Multi-Region Active-Active

**Region manager:**

- Config from `PEZHWAN_REGIONS=us-east-1,eu-west-1,ap-southeast-1`
- Nearest-region routing via header or GeoIP
- Global cache invalidation via Redis Pub/Sub

**Session revocation broadcast** across regions.

**Acceptance:**

- Writes visible across regions within 1s
- Session revocation propagates globally < 2s
- Failover of one region leaves others error-free

---

## C.7 — Load Testing

**k6 tests:**

| Test              | Target            | Threshold               |
| ----------------- | ----------------- | ----------------------- |
| `auth.load.js`    | 10,000 RPS login  | p95 < 100ms, error < 1% |
| `refresh.load.js` | 8,000 RPS refresh | p95 < 100ms             |
| `verify.load.js`  | 50,000 RPS verify | p95 < 10ms              |
| `mixed.load.js`   | 15,000 RPS mixed  | p95 < 100ms             |

Generate a batch of valid tokens first, then fire them at verify.

**Acceptance:**

- All thresholds met
- Baseline recorded in `docs/operations/performance-baseline.md`

---

## C.8 — PQC Performance Impact Assessment

| Operation         | RS256 | ML-DSA-65 | Hybrid |
| ----------------- | ----- | --------- | ------ |
| Sign (ms)         | 0.5   | 16.5      | 17.0   |
| Verify (ms)       | 0.1   | 3.2       | 3.3    |
| JWKS size (bytes) | 1,200 | 2,400     | 3,600  |
| JWT size (bytes)  | 350   | 3,700     | 4,000  |

**Mitigation:** Signing only on login/refresh. Verification at edge with cached JWKS.

**Acceptance:**

- No measurable latency regression for authenticated API calls
- Signing throughput at 500/sec per instance

---

# PART D — ENTERPRISE FEATURES (Weeks 7–9)

## D.1 — Multi-Language SDKs

Publish SDKs for: Python, Go, Java, .NET, Angular, Vue. Each SDK mirrors the TypeScript API and covers auth, session, MFA, authorization, tenant management.

**Acceptance:**

- 30+ tests per SDK pass
- Each SDK published to its registry (PyPI, Go modules, Maven Central, NuGet, npm)

---

## D.2 — CLI Tool

`@pezhwan/cli` with 50+ commands: users, tenants, sessions, roles, clients, audit, keys, backup, health, migrate, webhooks.

**Acceptance:**

- All commands work against local identity-server
- Published to npm

---

## D.3 — ABAC

Policy engine with conditions on user/resource/environment attributes. Deny > allow.

**Acceptance:**

- 20 fixture policies evaluated correctly
- ABAC + RBAC combined resolution works

---

## D.4 — Event Sourcing & CQRS

Append-only event store + projectors + replay service.

**Acceptance:**

- Replay reproduces current user state byte-for-byte
- Events are append-only
- Projector lag < 100ms p95

---

## D.5 — GraphQL Federation

Apollo Server with `@key` directives on User, Session, Tenant.

**Acceptance:**

- Federation gateway resolves User across subgraphs
- Introspection enabled in dev, disabled in prod

---

## D.6 — Real-Time Events (WebSocket/SSE)

Socket.io with Redis adapter.

**Events:** `session.revoked`, `password.changed`, `mfa.enabled`, `mfa.disabled`, `account.locked`, `login.new-device`.

**Acceptance:**

- Revoking session fires event within 1 second
- Multi-instance delivers events across pods

---

## D.7 — Teams & Organizations

Hierarchical teams with permission inheritance.

**Acceptance:**

- 5-level hierarchy works
- Effective permissions resolve correctly
- Delete cascades

---

## D.8 — Billing & Subscriptions

Stripe integration, plans: Free/Pro/Enterprise/Custom.

**Acceptance:**

- Upgrade takes effect immediately
- Overage generates invoice
- Webhook signature verified

---

## D.9 — SCIM 2.0

Users + Groups provisioning per RFC 7644.

**Acceptance:**

- Okta + Azure AD sync 100 users with 0 errors
- PATCH updates only specified attributes

---

## D.10 — SAML 2.0

SP-initiated + IdP-initiated flows; attribute mapping per tenant.

**Acceptance:**

- Okta + Azure AD flows work
- Signed assertion validated
- Replay rejected

---

## D.11 — Webhook System

HMAC-SHA256 signature, idempotency, exponential backoff (1s/10s/100s/1000s/10000s), dead letter after 5 failures.

**Acceptance:**

- Delivery < 500ms p95
- Retry correct
- Signature verifiable
- Replay idempotent

---

# PART E — APPLICATIONS & INFRASTRUCTURE (Weeks 10–14)

## E.1 — Admin Console

Screens: Dashboard, Users, Sessions, Audit, Clients, Tenants, Roles, Subscriptions, Security, Settings.

Guards: `RequireRole('ADMIN')`, `RequirePermission('admin:*')`.

**Acceptance:**

- All screens functional
- Lighthouse ≥ 90
- Non-admin gets 403 on every admin route

---

## E.2 — Developer Portal

Screens: API keys, Webhooks, Analytics, Docs, Profile.

**Acceptance:**

- Dev can create API key and make successful call within 2 minutes
- Live webhook test delivers within 5 seconds

---

## E.3 — Templates & Demos

5 framework templates + 8 demo apps.

**Acceptance:**

- Each template starts with `npm install && npm run dev`
- All 8 demos run without manual intervention

---

## E.4 — Docker + Kubernetes + Terraform

Production compose with Mongo replica set, Redis cluster, identity-server replicas behind nginx, Prometheus, Grafana, Loki.

Helm chart with HPA, PDB, NetworkPolicy.

Terraform provider with resources: `pezhwan_tenant`, `pezhwan_user`, `pezhwan_role`, `pezhwan_client`, `pezhwan_webhook`.

**Acceptance:**

- `docker compose -f docker-compose.prod.yml up -d` starts all services healthy
- `helm install pezhwan ./infrastructure/kubernetes/helm/pezhwan` succeeds on minikube
- `terraform apply` creates resources visible via API

---

## E.5 — Observability

**Metrics:** http_requests_total, auth_success_total, auth_failure_total, sessions_active, jwt_verification_duration_seconds (by algorithm), db_query_duration_seconds, rate_limit_hits_total, webhook_deliveries_total.

**Tracing:** OpenTelemetry with Jaeger; span attributes include `algorithm` so PQC spans are visible.

**Acceptance:**

- Jaeger shows complete trace for login with `algorithm=hybrid-RS256-MLDSA65`
- Grafana dashboard renders with zero missing panels

---

# PART F — SECRETS & COMPLIANCE (Weeks 15–16)

## F.1 — Secret Management

Replace all `process.env` reads in app code with `SecretProvider`. Implement `EnvSecretProvider`, `FileSecretProvider`, `ChainSecretProvider`, `VaultSecretProvider`, `AwsSecretsManagerProvider`.

**K8s deployment:** mount secrets as volumes, not env vars.

**Acceptance:**

- `grep -r "process.env.PEZHWAN_" packages/*/src/` returns zero in application code
- Secret rotation triggers pod restart via sidecar
- Secret scanning passes on every commit

---

## F.2 — CI/CD Gates

Every merge must pass:

| Gate              | Tool                  | Threshold              |
| ----------------- | --------------------- | ---------------------- |
| Typecheck         | tsc                   | 0 errors               |
| Lint              | ESLint                | 0 errors               |
| Unit tests        | Jest                  | 80% coverage           |
| Integration tests | Jest + testcontainers | All pass               |
| Security scan     | Gitleaks              | 0 secrets              |
| Dependency audit  | npm audit             | 0 high/critical        |
| Container scan    | Trivy                 | 0 high/critical        |
| Crypto agility    | Custom                | 0 hardcoded algorithms |
| PQC hybrid test   | Custom                | All pass               |

**Acceptance:**

- CI blocks merge on any failure
- Coverage badge ≥ 80%

---

# GLOBAL ACCEPTANCE CRITERIA

| Criterion            | Target                                     | Verification                     |
| -------------------- | ------------------------------------------ | -------------------------------- |
| Production readiness | 10/10                                      | `PRODUCTION_READINESS.md`        |
| Packages             | 14+                                        | `ls packages/`                   |
| SDK languages        | 7                                          | package count                    |
| Services             | 50+                                        | `ls packages/core/src/services/` |
| Tests                | 200+ unit, 50+ integration                 | CI summary                       |
| Coverage             | ≥ 80%                                      | Jest output                      |
| Load capacity        | 10k RPS login, 50k RPS verify, p95 < 100ms | k6 report                        |
| Uptime SLO           | 99.99%                                     | staging metrics                  |
| Security findings    | 0 critical/high                            | pentest report                   |
| Crypto agility       | 0 hardcoded algorithms                     | grep audit                       |
| PQC hybrid           | `hybrid-RS256-MLDSA65` works end-to-end    | integration test                 |
| Documentation        | 50+ files                                  | `docs/` count                    |
| Multi-region         | 3 regions active-active                    | deployment topology              |

---

# EXECUTION ORDER

```
Week 1   ─ Part A: crypto agility + PQC hybrid signing + JWKS edge cache
Week 2   ─ Part A: PQC KEM + key rotation + edge verification
Week 3   ─ Part B: blockers 1.1, 1.2, 1.3 (integration, drill, replica set)
Week 4   ─ Part B: blockers 1.4–1.8 (MFA migration, providers, rate limit, audit, ZKP)
Week 5   ─ Part B: blockers 1.9–1.13 (HSM, WebAuthn, mTLS, ATO, compliance)
Week 6   ─ Part C: pooling, write-behind, health, graceful shutdown
Week 7-8 ─ Part C: multi-region, load tests, PQC impact
Week 9-11─ Part D: SDKs, CLI, ABAC, event sourcing, GraphQL, WebSocket, teams, billing, SCIM, SAML, webhooks
Week 12  ─ Part E: admin console + developer portal
Week 13  ─ Part E: templates + demos
Week 14  ─ Part E: Docker + K8s + Terraform + observability
Week 15  ─ Part F: secret management + CI/CD gates
Week 16  ─ Final security audit + release
```

---

# DEFINITION OF DONE

For every task:

1. Code merged to `main` with passing CI
2. Tests added and passing (unit + integration where applicable)
3. Documentation updated
4. Security review sign-off (for security-sensitive changes)
5. Changelog entry
6. Two reviewer approvals (security-sensitive changes)

For the whole program:

1. All 8 blockers closed
2. All SDKs published
3. All enterprise features implemented
4. All 3 apps deployed
5. All 5 templates and 8 demos working
6. Full infrastructure deployed to staging
7. PQC hybrid signing live in production
8. Crypto agility verified via config swap
9. Final security audit passed
10. Production readiness score = 10/10

---
