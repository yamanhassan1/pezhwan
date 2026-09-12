# Incident Response

## 1. Purpose and symptoms
General response workflow for any security-relevant or service-impacting event
not covered by a specific runbook. Credential compromise and attack patterns go
to `security-breach.md`.
**Symptoms:** `auth.login.failed` or `security.event` spikes, audit-log
anomalies (gaps/forks in the `prevHash` chain, `sequence` jumps), unusual
`requestId`/`correlationId` patterns, user reports of unauthorized access.

## 2. Severity / priority
P1 (critical) -- active exfiltration or confirmed account takeover. P2 (high) --
strong breach indicator; investigate. P3 (medium) -- anomalous but low-impact.

## 3. Preconditions
Structured JSON logs (`PezhwanLogger`), MongoDB audit collection, and
`MetricsRegistry` snapshot access. Incident channel + ticket tracker. Security
lead reachable per `docs/security/incident-response.md`.

## 4. Step-by-step response

### 1. Record detection
Ticket: detection time, alert source, affected component, initial severity.

### 2. Triage by severity and pattern
Route by pattern: credential/token compromise -> `security-breach.md`; data
loss -> `database-failover.md`; region outage -> `tenant-failover.md`;
otherwise continue here.

### 3. Contain
Preserve evidence; never delete while containing. Typical: revoke the session
family (`POST /v1/sessions/all/revoke`), disable the account (`isActive: false`,
bump `tokenVersion`), block source IPs at the WAF/network layer, revoke
compromised keys (`KeyStoreService.revokeKey`, see `key-rotation.md`).

### 4. Investigate the audit trail
```bash
mongosh "$PEZHWAN_MONGODB_URI" --eval '
  db.auditlogs.find({ "actor.id": "USER_ID",
    createdAt: { $gte: new Date("START") } }).sort({ sequence: 1 }).toArray()'
```
Check `prevHash` chain integrity (forks = tampering/concurrent writers, G7),
unexpected action types, `sequence` gaps.

### 5. Correlate with requestId / correlationId
`requestContext()` threads both through every request and child logger:
```bash
grep '"requestId":"REQUEST_ID"' /var/log/pezhwan/*.jsonl
```
Group logins by source IP for stuffing signatures
(`jq -r '.requestContext.ip' | sort | uniq -c | sort -rn`).

### 6. Cross-check metrics
```ts
metrics.get('auth.login.failed'); metrics.get('auth.refresh.reuse');
metrics.get('security.event');    metrics.get('ratelimit.hit');
metrics.get('token.revoked');
```
`auth.refresh.reuse` + `auth.login.failed` together signal token compromise.

### 7. Recover and close
Apply the matching runbook, restore service, complete the postmortem, file the
incident record.

## 5. Verification
- [ ] Incident contained; service restored; no ongoing exfiltration.
- [ ] Affected users/sessions reviewed; metrics back to baseline.
- [ ] Audit integrity confirmed or gaps documented.

## 6. Rollback
Incident-specific -- defer to the applicable runbook (deploy rollback:
`emergency-rollback.md`).

## 7. Post-incident review checklist
- [ ] Timeline: detection/triage/containment/investigation/resolution.
- [ ] Scope: tenants, users, data affected; root cause and enabling gap.
- [ ] Customer impact and data exposure (GDPR 72 h notification if exposed:
  `docs/security/compliance/gdpr.md`).
- [ ] Actions with timestamps; follow-ups and prevention.

## 8. Owner references
| Item | Reference |
| --- | --- |
| Policy | `docs/security/incident-response.md` |
| Controls / threats | `docs/security-audit.md` (G1--G7), `docs/THREAT-MODEL.md` |
| Audit chain | `packages/core/src/services/audit.service.ts` |
| Logger / metrics | `packages/core/src/services/logger.service.ts`, `services/metrics.service.ts` |
| GDPR notification | `docs/security/compliance/gdpr.md` (72 h) |
| Tabletop | Quarterly per `docs/security/incident-response.md` |
| Alert source | `security.event`, audit anomalies, user reports |
| On-call | Security lead (P1/P2), Platform team (P3/P4) |