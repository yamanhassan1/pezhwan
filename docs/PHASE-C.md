# PEZHWAN — Phase C: Build Record (Remaining Hardening — Threat-Model G1–G7)

Status: **COMPLETE AND VERIFIED**. Every `[Gap]`/`[Partial]` action item in
`docs/THREAT-MODEL.md` (§ "Control Inventory & Gaps") is now closed — either
implemented and verified by execution, or explicitly documented as an accepted
carve-out/guarantee. Phase C builds on `PHASE-A.md` and `PHASE-B.md`; the full
security picture lives in `docs/security-audit.md`.

## 1. Phase C status

| Check | Result |
|-------|--------|
| `npm run build` (crypto, core, express, identity-server, full) | OK — clean |
| `npm run test -w @pezhwan/core` | OK — **20/20 pass** (19 in Phase B + G5 restart round-trip) |
| `npm run test -w @pezhwan/express` | OK — **9/9 pass** (7 in Phase B + 2 rate-limit regressions) |
| `npm run test --workspaces --if-present` | OK — **28/28 pass** (17 in Phase B, 11 added during hardening) |
| live-Mongo MFA-lock script | OK — 6/6 PASS lines, then script removed |

Phase C leaves no `[Gap]` items open in the threat model.

## 2. What changed

### G1 — HTTP rate limiting active on every auth router
- New `rateLimit()` middleware (`packages/express/src/rateLimit.ts`): consumes
  the core `RateLimitService` (atomic fixed window, Redis or in-memory), emits
  `429` `{ success:false, error:{ code:'RATE_LIMITED' } }` with
  `Retry-After` and `X-RateLimit-Limit` / `X-RateLimit-Remaining`.
- Mounted on the auth, session, OAuth, MFA and verification routers. OAuth
  `/token` is scoped per `client:<clientId>`, else source IP.
- **Policy:** limiter failure degrades open — Redis/cache outages never turn into
  a self-DoS. Availability over strictness; the durable throttle (G2) remains
  authoritative for MFA.
- Verified: 2 new express tests (unit + end-to-end login-budget 429).

### G2 — MFA brute-force throttle (fail closed)
- Durable per-user `mfaFailedAttempts` + `mfaLockUntil` on the user document
  (shared across instances, survives restart).
- `verifyMfa` / `disable` reject with `MFA_LOCKED` while locked — even a
  *correct* code is refused (fail closed); 5 failures → 15-minute lock; success
  resets the counter.
- Verified: live-Mongo script (wrong codes rejected, lock engages, correct code
  rejected while locked, unlock restores service) — 6/6 PASS, then deleted.

### G3 — TOTP secret at rest (accepted carve-out, documented)
- `mfaSecret` remains base64 + `select:false` — the plaintext secret is required
  for TOTP recomputation, so hashing is impossible.
- **Documented exception**: `THREAT-MODEL.md` §2 + `security-audit.md` follow-up
  #4 recommend field-level envelope encryption for deployments placing the DB
  outside the trust boundary. This is a deployment knob, not a code change.

### G4 — 503 vs 401 on storage-dependency failure
- `createAuthenticate` now forwards `SecurityDependencyError`
  (`FAILED_SECURITY_DEPENDENCY`) as **503** instead of collapsing to a misleading
  401. Invalid tokens remain 401 via `requireAuth`.
- Verified: updated express regression asserts 503 + no identity attached.

### G5 — Durable signing keys + rotation for the reference server
- `KeyStore.clear()` added (additive) to the crypto `KeyStore`.
- New exported `initKeyPersistence(runtime, { directory, rotationIntervalMs })`
  in core: clears the throwaway bootstrap key, restores persisted keys via
  `FileKeyStoreAdapter` (or generates + persists on first boot), optionally
  schedules `setInterval` rotation, returns `{ dispose() }`.
- identity-server awaits it **before** serving (restored keys ⇒ tokens minted by
  a previous process verify), cadence from `PEZHWAN_SIGNING_KEY_ROTATION_MS`
  (default 30 d).
- Corrupt key files fail loud (fail closed), never silently regenerated.
- Verified: core restart round-trip test — a token signed by "process 1"
  verifies on "process 2" over the same directory (`packages/core/test/security.test.ts`).

### G6 — Explicit body-size cap + env rate-limit wiring
- `express.json({ limit: config.server.bodyLimit })` with `PEZHWAN_BODY_LIMIT`
  (default `100kb`, regex-validated).
- Rate budgets flow from env (`PEZHWAN_RATE_LIMIT_LOGIN/OTP/API`, `parseBudget`)
  through `config.rateLimit.rules` into `createPezhwan(..., rateLimits)`.

### G7 — Audit chain HA guarantee (documented best-effort)
- `prevHash` SHA-256 chain remains best-effort under concurrent HA writers
  (chains can fork); this guarantee is now explicit in `THREAT-MODEL.md` §10.
- Deployments requiring strict ordering should serialize audit writes via a
  single-writer shard (follow-up, `security-audit.md` §5.5).

## 3. Remaining follow-ups (all optional, tracked in `security-audit.md` §5)

1. Opt-in per-request permission re-check (`requireFreshPermissions`).
2. Mongo replica set + transactions for rotation `create`+`finalise`.
3. Redis Sentinel/Cluster in `RedisManager`.
4. Field-level envelope encryption of `mfaSecret` + signing PEMs (outside trust
   boundary deployments).
5. Audit retention knob + single-writer shard for strict ordering (G7 hardening).

## 4. Cross-references

- `docs/THREAT-MODEL.md` — § Control Inventory & Gaps: all items `[Verified]` /
  `[Documented]`.
- `docs/security-audit.md` — evidence table + controls (G1–G7) + follow-ups.
- `docs/PHASE-A.md`, `docs/PHASE-B.md` — prior phases (this record builds on both).