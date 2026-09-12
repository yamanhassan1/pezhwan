# Database Failover (MongoDB Replica Set)

## 1. Purpose and symptoms
MongoDB (`pezhwan-rs`, 3-node per `infrastructure/docker/docker-compose.yml`) is
the durable source of truth; Redis is an optimiser, never authoritative. This
runbook covers primary failover, replica-sync verification, Redis cache
invalidation, app reconnect, and DR restore if data was lost.
**Symptoms:** `/health/ready` 503 with `mongodb: "unavailable"`,
`MongoServerSelectionError` in logs, no PRIMARY in `rs.status()`, or
`auth.login.failed` spikes from fail-closed account-state checks.

## 2. Severity / priority
P1 (critical) when no primary is elected or data loss is suspected. P2 (high)
when only a secondary is down and the primary is healthy.

## 3. Preconditions
`mongosh` access to `pezhwan-mongo1/2/3` and the server host. Known backup at
`backups/latest.pzbu` + `PEZHWAN_BACKUP_KEY`. Recovery targets RPO < 24 h, RTO <
1 h (`docs/operations/backup-restore.md`).

## 4. Step-by-step response

### 1. Inspect replica set status
```bash
mongosh --host pezhwan-mongo1 --eval 'rs.status()'
```
Check `myState` (1 = PRIMARY, 2 = SECONDARY), `optimeDate` lag, and PRIMARY presence.

### 2. Confirm / trigger primary election
Auto-election occurs when the primary is unreachable (10-30 s). Re-check:
```bash
mongosh --host pezhwan-mongo1 --eval '
  rs.status().members.forEach(m => console.log(m.stateStr, m.name))'
```
If none, prefer manual reelection only with a clear picture (stale primary
`rs.stepDown()`, or reconfiguration).

### 3. Verify replica sync
```bash
mongosh --host pezhwan-mongo1 --eval '
  rs.status().members.map(m => ({ name: m.name, state: m.stateStr,
                                  lagMs: m.lag, optime: m.optimeDate }))'
```
Secondaries should trail the primary by seconds.

### 4. Invalidate Redis cache
```bash
redis-cli FLUSHDB   # brief window of relaxed rate-limit strictness
```
Or wait for 30 s session-cache and 15 m rate-limit windows to expire naturally.

### 5. Verify app reconnect
```bash
curl -s https://ISSUER/health/ready | jq '.dependencies.mongodb'   # "ready"
curl -s -X POST https://ISSUER/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}'
```

### 6. DR restore (data loss)
Never point production at a restored store without proof:
```bash
node scripts/verify-backup.mjs backups/latest.pzbu --restore
node scripts/restore-drill.mjs --in backups/latest.pzbu --db pezhwan --verify-auth
# Only if report.ok && authVerification.authOk:
infrastructure/scripts/restore.sh --archive backups/latest.pzbu --target pezhwan
```
See `docs/operations/backup-restore.md` and `docs/security/disaster-recovery.md`.

## 5. Verification
- [ ] `rs.status()` shows PRIMARY + synced secondaries.
- [ ] `/health/ready` 200, `mongodb: "ready"`.
- [ ] Login/refresh round-trip succeeds; audit `sequence` continues.
- [ ] `auth.login.failed` baseline; Redis state re-populated.

## 6. Rollback
A primary election is not rolled back -- the new primary is authoritative; a
recovered old primary rejoins as secondary. DR restore reverts only by restoring
a newer verified backup or re-pointing to the original DB.

## 7. Post-incident review checklist
- [ ] Timeline: detection, election, recovery; replication lag post-failover.
- [ ] Compare last audit `sequence` primary vs secondary for divergence.
- [ ] Was the Redis flush necessary? Any secondary impact?
- [ ] Backup freshness confirmed; schedule drill if stale.
- [ ] Compose/K8s replica set reviewed for resilience gaps.

## 8. Owner references
| Item | Reference |
| --- | --- |
| Compose replica set | `infrastructure/docker/docker-compose.yml` (`mongo1/2/3`) |
| K8s DB config | `infrastructure/kubernetes/helm/pezhwan/values-prod.yaml` |
| Backup / restore | `scripts/backup-drill.mjs`, `scripts/restore-drill.mjs`, `scripts/verify-backup.mjs`, `infrastructure/scripts/restore.sh` |
| Policy | `docs/operations/backup-restore.md`, `docs/security/disaster-recovery.md` |
| Health endpoint | `/health/ready` `apps/identity-server/src/server.ts:142` |
| Alert source | `/health/ready` 503, `MongoServerSelectionError`, auth spikes |
| On-call | Platform team (database / infrastructure) |