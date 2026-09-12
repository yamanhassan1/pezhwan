# PCI DSS compliance

Pezhwan handles authentication and access control — **not cardholder data**.
`PciDssService` (`packages/core/src/services/compliance/pci.service.ts`)
provides the controls an IAM layer adjacent to a Cardholder Data Environment
(CDE) needs. Cardholder data itself is out of scope for Pezhwan.

---

## 1. What the service implements

- **PAN tokenization (placeholder)** — `tokenize(pan)` exchanges a PAN for a
  token via an injected `TokenVault`. Raw PANs never touch logs or MongoDB.
  Production must delegate to a certified tokenization vault or the acquiring
  bank's token service.
- **Separation of duties** — `checkSeparationOfDuties(userId, roles, matrix)`
  flags one user holding incompatible roles; a violation raises a critical
  audit event.
- **CDE access reviews** — `reviewCdeAccess(findings)` logs access-review
  findings as warning audit events (`finding: 'cde_access_review'`),
  designed for cron-driven reviews.

## 2. Relevant PCI DSS requirements

### Requirement 8 — Identify and authenticate access

| Control                          | Pezhwan implementation                                   |
| -------------------------------- | --------------------------------------------------------- |
| 8.1 Unique IDs                   | `tenantId + email/phone` unique per tenant                |
| 8.2/8.3 MFA                     | TOTP, backup codes, WebAuthn; risk-based MFA step-up      |
| 8.4 Password policy              | Argon2id hashing, strength validation, reuse rejected      |
| 8.5 Account lockout              | 5 failures, 15-min lockout, `retryAfterMs`                |
| 8.6 Session timeout              | Idle and absolute expiry server-side                     |
| 8.7 Password history             | Current-password reuse rejected on change                 |

### Requirement 7 — Least privilege

RBAC deny-by-default; permissions assigned server-side only; admin gated by
`requireRole('ADMIN')`.

### Requirement 10 — Audit trails

All auth events logged with correlation IDs; retention configurable via
`AuditService.setRetentionDays()` (PCI minimum: 1 year, 3 months immediately
available).

### Requirement 11 — Testing

`npm audit`, `gitleaks`, `secret-scan.mjs` in CI; methodology in
`docs/security/penetration-testing.md`.

## 3. What remains the organization's responsibility

| Requirement                            | Responsibility                                   |
| -------------------------------------- | ------------------------------------------------ |
| CDE network segmentation               | Infrastructure / cloud networking                |
| Certified tokenization                 | External vault or bank token service             |
| CDE vulnerability scanning             | Infrastructure scanning tools                    |
| PCI DSS assessment                     | Qualified Security Assessor (QSA)               |

## 4. Deployment checklist

- [ ] `PciDssService` wired to a certified `TokenVault`
- [ ] `incompatibleRoles` matrix defined against the role taxonomy
- [ ] CDE access reviews scheduled (quarterly)
- [ ] Audit retention meets PCI minimum
- [ ] PCI-relevant auth controls pass `security-audit.mjs`