# Emergency Rollback

## 1. Purpose and symptoms
Fast revert of a release that shipped a regression, data-corruption issue, or
security problem. Compressed `zero-downtime-deployment.md` rollback; investigate
afterward.
**Symptoms:** 5xx or `auth.login.failed` spike right after deploy, corrupted
writes (broken `prevHash` chains, mangled records), new vuln in the shipped tag,
readiness probes looping.

## 2. Severity / priority
P1 (critical) -- always. Roll back immediately, then investigate.

## 3. Preconditions
Previous known-good image tag / Helm revision identified and pullable. Backup
verified for the current DB (`node scripts/verify-backup.mjs
backups/latest.pzbu --restore`) if data recovery may be needed.

## 4. Step-by-step response
### 1. Identify the previous good revision
```bash
helm history pezhwan -n prod
docker inspect pezhwan-identity-server --format '{{.Config.Image}}'
```
### 2. Roll back
Kubernetes:
```bash
helm rollback pezhwan <previous-revision> -n prod --wait --timeout 10m
# or pin the image explicitly:
helm upgrade --install pezhwan infrastructure/kubernetes/helm/pezhwan \
  --namespace prod --values infrastructure/kubernetes/helm/pezhwan/values-prod.yaml \
  --set image.tag=<previous-good-tag>
```
RollingUpdate keeps an old pod serving while new pods replace -- zero downtime
while the readiness gate held. Docker Compose:
```bash
export PEZHWAN_IMAGE_TAG=<previous-good-tag>
docker compose up -d --no-deps identity-server
```
### 3. Verify recovery
```bash
curl -s https://ISSUER/health/live | jq '.ok'
curl -s https://ISSUER/health/ready | jq '.ok'
curl -s -X POST https://ISSUER/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
```
### 4. Verify data safety
Rollback restores code, not data. Confirm the store is intact:
```bash
mongosh "$PEZHWAN_MONGODB_URI" --eval '
  db.auditlogs.find().sort({ sequence: -1 }).limit(3).toArray()'
curl -s https://ISSUER/.well-known/jwks.json | jq '.keys | length'
```

## 5. Considerations
- **Migrations applied.** Check the migration ledger; if the rolled-back release
  ran forward migrations, rebuild indexes from `infrastructure/docker/mongo/init.js`
  + model definitions. Irreversible migration? Fix-forward instead.
- **MFA secret migration.** If reverted mid `migrate-mfa-secrets.mjs`, run
  `node scripts/migrate-mfa-secrets.mjs --rollback` (restores from `mfaSecretsBackup`).
- **Signing keys.** Keep `PEZHWAN_SIGNING_KEYS_PATH` stable across releases;
  changing it orphans outstanding access tokens (FileKeyStoreAdapter, durable).
- **Data safety.** Never serve production from a restored backup without
  `node scripts/restore-drill.mjs --verify-auth` passing first; data issues
  require a DR restore (`database-failover.md`, step 6).

## 6. Verification (incident close)
- [ ] `/health/live` and `/health/ready` 200; no 5xx for 15 min.
- [ ] Signing keys verify; MFA unaffected; data integrity confirmed.
- [ ] Incident record filed with revision diff and affected customers.

## 7. Post-incident review checklist
- [ ] Timeline: detection -> rollback -> recovery; known-good tag restored.
- [ ] DB schema/indexes match the rolled-back release (migration ledger).
- [ ] Bad tag preserved for debugging; regression test filed pre-release.

## 8. Owner references
| Item | Reference |
| --- | --- |
| Helm rollback | `helm rollback --revision` (see `zero-downtime-deployment.md`) |
| Compose rollback | `docker compose up --no-deps identity-server` (pinned tag) |
| Migrations | `docs/operations/mfa-migration.md`; migration ledger / release record |
| Backup/restore | `docs/operations/backup-restore.md`; `scripts/restore-drill.mjs`; `scripts/verify-backup.mjs` |
| DB failover | `docs/operations/runbooks/database-failover.md` |
| Key persistence | `initKeyPersistence()` `packages/core/src/pezhwan.ts:333` |
| Alert source | 5xx spike, readiness loop, data-corruption alert |
| Approver / executor | Platform owner (P1 approval), Platform team |