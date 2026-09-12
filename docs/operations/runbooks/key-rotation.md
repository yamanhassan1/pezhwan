# Signing Key Rotation

## 1. Purpose and symptoms
Keys rotate on `PEZHWAN_SIGNING_KEY_ROTATION_MS` (default ~24.8 d). `KeyStoreService`
(`packages/core/src/services/infrastructure/key-store.service.ts`) drives the
lifecycle generate -> STAGED -> ACTIVE -> VERIFY-ONLY -> RETIRED -> REVOCED. Rotation
activates a new key and demotes the previous ACTIVE key to VERIFY-ONLY so in-flight
tokens keep verifying while `/.well-known/jwks.json` advertises the new `kid`. Key TTL
is 30 days (`defaultTtlMs`), expiry pruned by TTL index.
**Symptoms:** `UNKNOWN_KEY` errors, `auth.login.failed` spike after key loss/revocation,
an expired key in JWKS, or a planned rotation before TTL expiry.

## 2. Severity / priority
P3 (low) proactive; P2 (medium) on `UNKNOWN_KEY` failures; P1 (critical) only if the
private key is suspected compromised (hand off to `security-breach.md`).

## 3. Preconditions
Access to the identity server host/container and `PEZHWAN_MONGODB_URI`. Confirm
`initKeyPersistence` mounted a durable keys directory before signing began
(`apps/identity-server/src/server.ts:96`). Change approved by the release owner.

## 4. Step-by-step response

### 1. Assess current key state
```bash
mongosh "$PEZHWAN_MONGODB_URI" --eval '
  db.keys.find({ tenantId: "TENANT_ID" }).sort({ createdAt: -1 }).toArray()'
```
Expected: one `ACTIVE` key; zero or more `VERIFY-ONLY` previous keys.

### 2. Rotate
```bash
node scripts/rotate-keys.mjs --tenant-id TENANT_ID
# In code:  await createKeyStoreService().rotateKey(tenantId, 'RS256');
# Old ACTIVE -> VERIFY-ONLY; new STAGED -> ACTIVE.
```

### 3. Verify the JWKS advertises the new kid
```bash
curl -s https://ISSUER/.well-known/jwks.json | jq '.keys[] | {kid, alg, use}'
```
The new `kid` is present; the previous key may remain listed until TTL (VERIFY-ONLY, intended).

### 4. Verify signing + verification round-trip
```bash
curl -s -X POST https://ISSUER/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"..."}'
# Decode the access token and confirm "kid" matches the active key:
echo "$ACCESS_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r '.kid'
```

### 5. Old tokens still validate
Tokens signed pre-rotation verify against the VERIFY-ONLY key (or expire
naturally: access 15 min, refresh 30 d). No `UNKNOWN_KEY` in logs.

### 6. Corrupt key files fail loud (F8)
`FileKeyStoreAdapter.load()` throws on a corrupt `.pem`; tampering must never
silently desync. On startup failure, inspect `$PEZHWAN_SIGNING_KEYS_PATH`,
restore keys from backup or let `initKeyPersistence` generate fresh ones,
then restart and re-verify.

## 5. Verification
- [ ] JWKS shows the new `kid`; fresh logins produce no `UNKNOWN_KEY`.
- [ ] New access tokens carry the new `kid` and pass protected routes.
- [ ] Pre-rotation tokens still verify via VERIFY-ONLY.
- [ ] `auth.login.failed` / `auth.refresh.reuse` at baseline.
- [ ] Keys directory parses cleanly across a restart (G5 round-trip).

## 6. Rollback
Rotation is not reversible; old keys remain VERIFY-ONLY/retired. If the new key
is compromised before traffic, `keyStore.revokeKey(kid, tenantId)` then rotate a
replacement immediately; affected clients must re-authenticate.

## 7. Post-incident review checklist
- [ ] Rotation recorded in the audit trail; `PEZHWAN_SIGNING_KEY_ROTATION_MS` verified.
- [ ] New key `expiresAt` ~30 d out; expiry pruning observed.
- [ ] No client hard-codes a `kid` (all use JWKS discovery).
- [ ] Incident record updated if the rotation was unplanned.

## 8. Owner references
| Item | Reference |
| --- | --- |
| Key store service | `packages/core/src/services/infrastructure/key-store.service.ts` |
| Key persistence | `initKeyPersistence()` `packages/core/src/pezhwan.ts:333`, `FileKeyStoreAdapter` |
| Rotation env | `PEZHWAN_SIGNING_KEY_ROTATION_MS` `apps/identity-server/src/config/env.ts:76` |
| JWKS endpoint | `/well-known/jwks.json` `apps/identity-server/src/server.ts:280` |
| Rotate script | `scripts/rotate-keys.mjs` |
| Control / threat | G5 `docs/security-audit.md`; `docs/THREAT-MODEL.md` (signing keys) |
| Alert source | `auth.login.failed` + `UNKNOWN_KEY`, JWKS mismatch |
| On-call | Platform team (identity infrastructure) |