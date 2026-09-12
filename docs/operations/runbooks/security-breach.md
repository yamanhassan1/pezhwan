# Security Breach Response

## 1. Purpose and symptoms
Response to suspected organic security incidents against the fail-closed
control surface: Argon2id hashing, refresh-token reuse detection, strict
CORS/CSRF, atomic rate limiting, and the tamper-evident audit `prevHash` chain.
**Symptoms:**
- `auth.refresh.reuse` metric spike + `REFRESH_TOKEN_REUSE` audit events (stolen refresh token replayed).
- Mass `auth.login.failed` from distributed IPs (credential stuffing) or `ratelimit.hit` exhaustion.
- Elevated `ORIGIN_REJECTED` 403s from the CORS allowlist, or `pezhwan_csrf` vs `x-csrf-token` mismatches (CSRF attempt).
- Users reporting unexpected logouts/actions; unrequested `tokenVersion` bumps.

## 2. Severity / priority
P1 (critical) -- confirmed account takeover or token compromise, multiple tenants
affected. P2 (high) -- indicators only (possible, not confirmed).

## 3. Preconditions
Mongo (users, sessions, auditlogs), structured logs with `requestId`, and
`MetricsRegistry` access. Security lead on-call per `docs/security/incident-response.md`.

## 4. Step-by-step response
### 1. Contain first (do not delete evidence)
**a) Confirm credential-stuffing scope**
```bash
mongosh "$PEZHWAN_MONGODB_URI" --eval '
  db.users.find({ failedLoginAttempts: { $gte: 3 },
                  loginLockUntil: { $gt: new Date() } }).count()'
```
**b) Validate reuse handling completed**
Reuse already fired `revokeFamily(familyId)` (atomic, `session.service.ts`);
confirm families are `status: "revoked"`:
```bash
mongosh "$PEZHWAN_MONGODB_URI" --eval '
  db.sessions.find({ status: "revoked" }).sort({ updatedAt: -1 }).limit(50).toArray()'
```
**c) Manual containment if incomplete**
```ts
await runtime.sessions.revokeFamily(familyId, { tenantId, applicationId });
await runtime.admin.updateUser({ id, isActive: false });   // disable account
await runtime.admin.assignRole(id, 'NONE');                // bumps tokenVersion
```
**d) Rotate compromised keys/secrets**
```ts
const keyStore = createKeyStoreService();
await keyStore.revokeKey(kid, tenantId);          // immediate invalidation
await keyStore.rotateKey(tenantId, 'RS256');      // fresh ACTIVE key
```
### 2. Investigate the audit `prevHash` chain
```bash
mongosh "$PEZHWAN_MONGODB_URI" --eval '
  db.auditlogs.find({ "actor.id": "USER_ID",
    createdAt: { $gte: new Date("ATTACK_START") } }).sort({ sequence: 1 }).toArray()'
```
Focus event types: `security.refresh_token_reuse`, `security.cors_origin_rejected`,
`security.csrf_failed`, `auth.login.failed`, `session.revoked`, token-version bumps.
### 3. Correlate by requestId / source
```bash
grep '"requestId":"TARGET_ID"' /var/log/pezhwan/*.jsonl
grep '"auth.login.failed"' /var/log/pezhwan/*.jsonl \
  | jq -r '.requestContext.ip' | sort | uniq -c | sort -rn | head -20
```
### 4. Notify
Internal P1 alert within 15 min of confirmation. Affected users notified once
accounts are secured. GDPR: notify the supervisory authority within **72 hours**
if personal data was compromised (`docs/security/compliance/gdpr.md`); follow
`SECURITY.md` coordinated disclosure (90-day window).
### 5. Remediate and preserve evidence
Force re-auth (MFA) for affected accounts; bump `tokenVersion`. Revalidate
`corsAllowlist` + `csrfProtection`; block malicious origins. Rotate affected
signing keys/API keys/client secrets (all stored hashed). Re-run
`node scripts/security-audit.mjs` + intent-based tests.
Export the audit window and raw logs to secured storage before any destructive
action; no hard-deletes until the investigation completes.

## 5. Verification
- [ ] Compromised session families revoked; no `status: "active"` remains.
- [ ] `auth.refresh.reuse` / `auth.login.failed` back to baseline.
- [ ] CORS/CSRF failures reduced to routine probe traffic.
- [ ] Affected users can re-auth; `/health/ready` and JWKS normal.

## 6. Rollback
No rollback -- containment is corrective. If remediation breaks a flow, restore
the specific account/key per `key-rotation.md` / `emergency-rollback.md`.

## 7. Post-incident review checklist
- [ ] Detection (metric/event/report) and vector (stuffing/theft/CORS/CSRF).
- [ ] Scope: users, tenants, data; count of revoked families/disabled accounts.
- [ ] Actions with timestamps; GDPR 72 h decision on data access.
- [ ] Disclosure per `SECURITY.md`; prevention (limits, MFA adoption).
- [ ] Quarterly tabletop exercise updated with this scenario.

## 8. Owner references
| Item | Reference |
| --- | --- |
| Policy | `docs/security/incident-response.md` |
| Threats | `docs/THREAT-MODEL.md` (sections 2, 3, 6, 9) |
| Session rotation/reuse | `packages/core/src/services/session.service.ts` |
| Account state / tokenVersion | `packages/core/src/services/accountState.service.ts` (F9) |
| CORS/CSRF | `packages/express/src/security.ts` |
| Key store | `packages/core/src/services/infrastructure/key-store.service.ts` |
| Audit chain | `packages/core/src/services/audit.service.ts` |
| Disclosure | `SECURITY.md`; GDPR `docs/security/compliance/gdpr.md` (72 h) |
| Alert source | `auth.refresh.reuse`, `auth.login.failed`, `security.event`, `ORIGIN_REJECTED` 403s |
| On-call | Security lead (P1), Platform team (P2) |