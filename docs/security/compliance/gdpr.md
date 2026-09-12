# GDPR compliance

Pezhwan ships built-in support for GDPR (EU 2016/679) data-subject rights via
`GdprService` (`packages/core/src/services/compliance/gdpr.service.ts`). This
document covers what the service implements, what requires deployment process,
and what remains the organization's responsibility.

---

## 1. Personal data Pezhwan processes

| Category           | Examples                                                        |
| ------------------ | --------------------------------------------------------------- |
| Identifiers        | Email, phone, user ID, tenant ID, IP address                   |
| Authentication     | Argon2id password hash, MFA secret, backup codes, session data |
| Security metadata  | Login IP/geo, user agent, device, risk scores                  |
| Account metadata   | Roles, permissions, timestamps, lockout state                  |

Passwords exist only as Argon2id hashes; MFA secrets are base64 with
`select:false`. Neither is ever included in exports.

## 2. Data-subject rights implemented

### Data portability (Art. 20)

`GdprService.exportData(userId)` returns a `DataExportRecord`:

- `exportId`, `userId`
- `profile` — `SubjectProfile` (email, phone, createdAt, lastLoginAt, metadata)
- `exportedAt`

The profile accessor (`UserDataCollector`) is injected, keeping the service
storage-agnostic. Credentials, tokens, and raw secrets are excluded.

### Right to erasure (Art. 17)

`GdprService.erase(userId, purge?)` is two-phase:

- `purge: false` — soft-delete; record kept in a reversal window; returns
  `retentionNote` noting a scheduled hard purge
- `purge: true` — hard-delete via the injected `DataErasureTarget`; returns
  `purgedAt`

Both actions write audit entries (`compliance: 'gdpr'`) with severity `warning`
(soft) or `critical` (purge). Access (Art. 15) is satisfied through the export
endpoint after the organization verifies the requester's identity.

## 3. What requires deployment process

| Requirement                       | Responsibility                                            |
| --------------------------------- | --------------------------------------------------------- |
| Lawful basis for processing       | Organization documents (consent/contract/legitimate interest) |
| Consent management                | Organization implements collection and withdrawal         |
| DPIA                              | Organization conducts under Art. 35                       |
| Processor agreements / SCCs       | Organization executes DPAs and transfer safeguards        |
| Retention schedule                | Organization defines windows; Pezhwan hard-purge is the enforcement step |
| Breach notification (72h)         | Organization notifies the supervisory authority           |
| Privacy notice                    | Organization publishes; data categories above feed the notice |

## 4. Deployment checklist

- [ ] `UserDataCollector` wired to the user store
- [ ] `DataErasureTarget` wired for soft-delete and hard-purge
- [ ] Export endpoint exposed behind authentication
- [ ] Erasure endpoint exposed behind authentication + identity verification
- [ ] Retention schedule enforced (cron drives `erase(userId, true)`)
- [ ] DPIA completed and breach procedure tested