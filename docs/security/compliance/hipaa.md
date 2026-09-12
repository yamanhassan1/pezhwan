# HIPAA compliance

`HipaaService` (`packages/core/src/services/compliance/hipaa.service.ts`)
provides the audit and access-control hooks needed to demonstrate HIPAA
alignment for platforms that handle Protected Health Information (PHI). Pezhwan
itself does not store PHI — it is the identity layer controlling who can reach
PHI-bearing systems.

---

## 1. What the service implements

- **PHI access audit trail** — `recordPhiAccess(event)` logs who accessed whose
  PHI, when (action `read|write|delete`), which resource, why (reason), and
  from where (IP). Satisfies the Privacy Rule accountability requirement.
- **Minimum-necessary reviews** — `flagExcessiveAccess({userId, resource,
  detail})` raises a warning audit event with
  `finding: 'minimum_necessary_exceeded'` when access exceeds the minimum
  necessary standard.
- **BAA status tracking** — `assessBaa(record)` returns `active` (>30 days to
  expiry), `expiring` (<30 days), or `expired`, based on `signedAt`. Tracks
  `organizationId`, `version`, `status`.

## 2. Security Rule safeguard mapping (45 CFR 164)

| Safeguard / requirement            | Pezhwan implementation                                           |
| ---------------------------------- | ---------------------------------------------------------------- |
| Technical — access control         | `tenantId + email/phone` unique IDs; per-request auth            |
| Technical — unique user ID         | Unique per-tenant identities                                    |
| Technical — automatic logoff       | Session idle + absolute expiry enforced server-side              |
| Technical — audit controls         | Audit service with correlation IDs, hash chain, retention        |
| Technical — integrity              | Token signature verification, CSRF, rate limiting                |
| Technical — authentication         | Password + MFA (TOTP, backup codes, WebAuthn), risk-based auth   |
| Technical — transmission security  | TLS required, HTTPS issuer in production                         |
| Technical — encryption/decryption  | Argon2id passwords, SHA-256 secrets, hashed at rest              |
| Administrative — security mgmt     | Audit trail, deny-by-default RBAC, security gate scripts          |
| Administrative — contingency       | Backup verification, restore drills, DR doc                      |
| Administrative — evaluation        | `scripts/security-audit.mjs` periodic gate                       |
| Physical safeguards                | Delegated to hosting environment                                  |

## 3. What remains the organization's responsibility

| Requirement                            | Responsibility                                       |
| -------------------------------------- | ---------------------------------------------------- |
| Physical security and media controls   | Cloud provider / data center                         |
| Workforce training and sanctions       | Organization                                         |
| PHI storage and handling               | The application above Pezhwan                        |
| Breach notification (60 days, HHS)     | Organization, per 45 CFR 164.408                     |
| BAA execution with business associates | Organization                                         |
| HIPAA risk analysis / assessment        | Organization                                         |

## 4. Integration pattern

```ts
const hipaa = new HipaaService(auditService);

await hipaa.recordPhiAccess({
  userId: 'staff-123', subjectId: 'patient-456',
  action: 'read', resource: 'lab-results', reason: 'treatment', ip: '10.0.1.42',
});

await hipaa.flagExcessiveAccess({ userId: 'staff-789', resource: 'billing', detail: 'Role does not require billing' });

const status = hipaa.assessBaa({ organizationId: 'org-001', signedAt: new Date('2025-01-15'), version: '2.0', status: 'active' });
```

## 5. Deployment checklist

- [ ] `HipaaService` wired to `AuditService`; PHI events logged on all
  PHI-touching endpoints
- [ ] Minimum-necessary reviews scheduled (quarterly)
- [ ] BAA records maintained for all business associates
- [ ] Risk analysis completed; breach procedure tested