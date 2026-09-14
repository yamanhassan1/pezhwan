# Operations Runbooks

Operational runbooks for responding to incidents, performing maintenance, and
recovering from failures in a Pezhwan identity deployment.

## How to use these runbooks

1. **Triage** -- Use the alert/severity table to identify the applicable runbook.
2. **Preconditions** -- Verify stated prerequisites before executing steps.
3. **Step-by-step** -- Follow steps sequentially; stop and reassess on a surprise.
4. **Verify** -- Confirm the fix with the verification section before closing.
5. **Rollback** -- Execute rollback if a step makes things worse.
6. **Post-incident** -- Complete the review checklist and file the incident record.

## Alert / severity mapping

| Runbook                                                   | Typical alert source                                                | Severity      |
| --------------------------------------------------------- | ------------------------------------------------------------------- | ------------- |
| [key-rotation](./key-rotation.md)                         | `auth.login.failed` / `UNKNOWN_KEY`, JWKS `kid` mismatch            | P3 (low)      |
| [tenant-failover](./tenant-failover.md)                   | Region probe `down`, per-region latency spike                       | P1 (critical) |
| [database-failover](./database-failover.md)               | Mongo `unavailable` in `/health/ready`, `MongoServerSelectionError` | P1 (critical) |
| [rate-limit-tuning](./rate-limit-tuning.md)               | `ratelimit.hit` spike, mass 429 responses                           | P2 (medium)   |
| [incident-response](./incident-response.md)               | Any P1/P2 event not covered by a specific runbook                   | P1 -- P2      |
| [security-breach](./security-breach.md)                   | `auth.refresh.reuse`, `REFRESH_TOKEN_REUSE`, CORS/CSRF blocks       | P1 (critical) |
| [zero-downtime-deployment](./zero-downtime-deployment.md) | Pod restart, readiness probe failures                               | P2 (medium)   |
| [emergency-rollback](./emergency-rollback.md)             | Post-deploy regression, data-corruption alert                       | P1 (critical) |

## Severity levels

| Level              | Response time     | Description                                                        |
| ------------------ | ----------------- | ------------------------------------------------------------------ |
| **P1 -- critical** | Immediate         | Outage, data loss/corruption, active security breach               |
| **P2 -- high**     | Within 1 hour     | Degraded service, significant user impact, possible security issue |
| **P3 -- medium**   | Within 4 hours    | Non-critical maintenance, tuning, proactive remediation            |
| **P4 -- low**      | Next business day | Cosmetic issues, documentation, optimization                       |

## On-call workflow

1. **Page received** -- Acknowledge within 5 minutes.
2. **Triage** -- Match the alert to a runbook via the mapping table.
3. **Contain** -- Execute the runbook's step-by-step.
4. **Communicate** -- Status at containment, every 30 min during P1, at resolution.
5. **Verify** -- Confirm health with the verification steps.
6. **Close** -- Final summary with timeline, root cause, follow-ups.

## Escalation

| Level              | Trigger                                                    | Action                                                               |
| ------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| On-call engineer   | First responder                                            | Execute runbook, attempt containment                                 |
| Security lead      | `P1 -- security-breach` or suspected credential compromise | Lead investigation                                                   |
| Platform owner     | P1 > 30 min or confirmed data loss                         | Approve rollback / emergency change                                  |
| Legal / compliance | Confirmed user-data breach                                 | Initiate GDPR 72 h notification (`docs/security/compliance/gdpr.md`) |

## Related documentation

- `docs/operations/backup-restore.md`, `docs/operations/multi-region.md`,
  `docs/operations/mfa-migration.md`
- `docs/security/disaster-recovery.md`, `docs/security/incident-response.md`,
  `docs/security/rate-limiting.md`, `docs/security/compliance/gdpr.md`
- `docs/security-audit.md` (controls G1--G7), `docs/THREAT-MODEL.md`
