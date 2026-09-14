# PEZHWAN Architecture

Architecture documentation for the PEZHWAN universal Identity & Access
Management (IAM) SDK: how the layers fit, how identities flow through the
system, how it is deployed, scaled, and kept tenant-isolated.

## Index

| Document                                             | Purpose                                                                                                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`overview.md`](./overview.md)                       | 60-second orientation: layer cake, runtime concept, security posture                                                       |
| [`architecture.md`](./architecture.md)               | Deep dive: system context, package graph, auth/refresh sequences, data model, security layers, component interaction, KPIs |
| [`data-flow.md`](./data-flow.md)                     | Authentication & authorization data flows with sequence diagrams                                                           |
| [`deployment-patterns.md`](./deployment-patterns.md) | Docker, Kubernetes/Helm, Terraform, Nginx/TLS, multi-region, backup                                                        |
| [`scaling.md`](./scaling.md)                         | Horizontal scaling guide: stateless verification, caching, sharding, performance targets                                   |
| [`multi-tenancy.md`](./multi-tenancy.md)             | Tenant isolation design, tenant scope on every query, quotas                                                               |

## Diagrams

PlantUML sources in [`diagrams/`](./diagrams/):

| Diagram                                                   | Content                                     |
| --------------------------------------------------------- | ------------------------------------------- |
| [`system-overview.puml`](./diagrams/system-overview.puml) | Components and dependency direction         |
| [`auth-flow.puml`](./diagrams/auth-flow.puml)             | Login / MFA / refresh sequences             |
| [`deployment.puml`](./diagrams/deployment.puml)           | Deployment topology (single + multi-region) |

## Related keystone documents

| Document                                     | Purpose                                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`../ARCHITECTURE.md`](../ARCHITECTURE.md)   | Concise architecture & design reference (types, flows, security model, scaling)          |
| [`../THREAT-MODEL.md`](../THREAT-MODEL.md)   | STRIDE threat model per component, source-verified controls and gaps                     |
| [`../PHASE-A.md`](../PHASE-A.md)             | Phase A milestones (auth core)                                                           |
| [`../PHASE-B.md`](../PHASE-B.md)             | Phase B milestones (release hardening)                                                   |
| [`../PHASE-C.md`](../PHASE-C.md)             | Phase C milestones (production readiness)                                                |
| [`../PROMPT.md`](../PROMPT.md)               | Original specification, acceptance criteria, load targets                                |
| [`../API/OPENAPI.yaml`](../api/OPENAPI.yaml) | Authoritative API specification                                                          |
| [`../security/`](../security/README.md)      | Security deep-dives (rate limiting, sessions, MFA, OAuth, multi-tenancy, key management) |
| [`../operations/`](../operations/README.md)  | Operations: deployment, monitoring, runbooks, multi-region, backup/restore               |

## Reading order

1. [`overview.md`](./overview.md) — understand the layer cake and runtime.
2. [`architecture.md`](./architecture.md) §1-5 — context, packages, flows, model.
3. [`data-flow.md`](./data-flow.md) — see each flow end-to-end.
4. [`multi-tenancy.md`](./multi-tenancy.md), [`scaling.md`](./scaling.md),
   [`deployment-patterns.md`](./deployment-patterns.md) — operationalize.
