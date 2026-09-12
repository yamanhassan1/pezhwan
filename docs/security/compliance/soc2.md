# SOC 2 compliance

`Soc2Service` (`packages/core/src/services/compliance/soc2.service.ts`) maps
the AICPA Trust Services Criteria to the identity layer and produces
auditor-ready evidence.

---

## 1. What the service implements

- **Change management evidence** — `recordChange(change)` logs deployments and
  config changes: `changeId`, `component`, `version`, `author`,
  `rollbackReady`. Maps to Common Criteria **CC8.1** and is stored as an audit
  event with `control: 'cc8.1_change_management'`.
- **Evidence snapshots** — `evidenceSnapshot(evidence)` produces timestamped
  `ControlEvidence` records: `criterion`, `control`, `satisfied`, `detail`,
  `evidenceAt`. Used for annual audit prep.

## 2. Trust Services Criteria mapping

| Criterion                | Example controls (CC)                        | Pezhwan implementation                              |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| Security                 | CC6.1/6.2/6.3 logical & physical access      | RBAC deny-by-default, MFA, per-request token verify  |
|                          | CC6.6 boundary protection                    | CORS allowlist, CSRF, security headers               |
|                          | CC6.7 data transmission                      | TLS required, HTTPS issuer enforced                  |
|                          | CC7.1 vulnerability management               | `npm audit`, `gitleaks`, `secret-scan` in CI        |
|                          | CC7.2 anomaly detection                      | Risk engine, bot detection, decoy alerts             |
|                          | CC8.1 change management                      | `recordChange()` audit evidence                     |
| Availability             | A1.1 capacity / A1.2 protections             | Rate limiting, health endpoints, graceful shutdown   |
|                          | A1.3 recovery                                | Backup verification + restore drills                 |
| Confidentiality          | C6.1/6.2 classification & disposal          | Never-logged secrets; GDPR soft-delete + hard-purge  |
|                          | C6.7 key management                          | Key rotation, JWKS lifecycle, key persistence        |
| Processing integrity     | PI1.1/1.2/1.3 input, processing, errors      | Zod validation, atomic token rotation, audit trail   |
| Privacy (PII)            | P6.1-P6.7 notice, choice, collection, access | Data categories documented; GDPR export/erase APIs  |

## 3. Evidence sources

| Evidence                      | Source                                              |
| ----------------------------- | --------------------------------------------------- |
| Access control tests          | `tests/security/` suite output                     |
| Audit trail integrity         | Audit hash-chain integration tests                  |
| Change management             | `Soc2Service.recordChange()` audit events           |
| Vulnerability scanning        | `npm audit`, `gitleaks` CI output                  |
| Incident response             | `docs/security/incident-response.md`                |
| Key rotation                  | `scripts/rotate-keys.mjs` execution log             |
| Backup/restore                | `verify-backup.mjs` + restore drill logs            |
| Access reviews                | Periodic role/permission review outputs             |

## 4. Deployment checklist

- [ ] `Soc2Service` wired to `AuditService`
- [ ] All deploys logged via `recordChange()` with rollback plan
- [ ] Evidence snapshot generated before each audit period
- [ ] Access reviews documented and scheduled
- [ ] Quarterly incident-response tabletop exercised