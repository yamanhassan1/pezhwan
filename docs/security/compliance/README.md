# Compliance framework

Pezhwan ships ready-made compliance services for the frameworks enterprise
customers most often ask about. They are implemented in
`packages/core/src/services/compliance/` and are wired to the same audit log
as the rest of the platform, so every compliance action — a data export, an
erasure, a PHI read — leaves an accountable, timestamped trail.

| Framework | Service | What it does |
| --------- | ------- | ------------ |
| GDPR | `gdpr.service.ts` | Data portability exports, right to erasure (soft-delete then scheduled hard purge), retention notes. |
| HIPAA | `hipaa.service.ts` | PHI access audit trail, minimum-necessary access reviews, BAA status assessment. |
| PCI DSS | `pci.service.ts` | PAN tokenization, separation-of-duties checks, CDE access reviews. |
| SOC 2 | `soc2.service.ts` | Change management evidence, trust-criterion evidence snapshots. |
| CCPA/CPRA | `ccpa.service.ts` | Household right-to-know and right-to-delete across linked profiles. |
| ISO 27001 | — (guide) | Control-mapping guidance in [`iso-27001.md`](./iso-27001.md). |
| FedRAMP | — (guide) | Control-mapping guidance in [`fedramp.md`](./fedramp.md). |

## Guides

- [GDPR](./gdpr.md)
- [HIPAA](./hipaa.md)
- [PCI DSS](./pci-dss.md)
- [SOC 2](./soc2.md)
- [CCPA/CPRA](./ccpa.md)
- [ISO 27001](./iso-27001.md)
- [FedRAMP](./fedramp.md)

## How to wire a service

Services take small, injectable dependencies so they stay storage-agnostic and
testable without a live database. For example, GDPR needs a way to collect a
subject profile and (optionally) an erasure target:

```ts
import { GdprService } from '@pezhwan/core';

const gdpr = new GdprService(
  {
    collect: (userId) => UserModel.findById(userId).lean(),
    erasureTarget: (userId, purge) => /* soft or hard delete PII */,
  },
  auditService,
);

const exportRecord = await gdpr.exportData(userId);
const result = await gdpr.erase(userId); // soft-delete; hard purge later
```

The other four services follow the same pattern: construct with options and an
optional `AuditService`, then call the targeted method from your routes or
middleware (`packages/core/src/middleware/compliance.middleware.ts` shows the
pattern).

## Operational note

A compliance framework is evidence, not certification. Use these services to
answer regulator and auditor requests (export one user, delete one user, prove
who read PHI), then validate the surrounding controls — retention windows,
backups, access reviews — in your deployment, as described under
[operations](../operations/).