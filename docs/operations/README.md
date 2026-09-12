# Pezhwan Operations Documentation

Index of operational runbooks, deployment guides, and production-readiness
reference for the Pezhwan identity platform.

---

## Production readiness

| Document | Description |
| -------- | ----------- |
| [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) | Ops-focused status report; remaining blockers and evidence criteria |
| [../../PRODUCTION_READINESS.md](../../PRODUCTION_READINESS.md) | Root scorecard and gap-closure log (canonical source) |

## Observability

| Document | Description |
| -------- | ----------- |
| [monitoring.md](./monitoring.md) | Metrics surface, Prometheus scrape config, Grafana dashboards, Loki ingestion |
| [alerts.md](./alerts.md) | Recommended alert rules, severity levels, tuning, runbook links |
| [logging.md](./logging.md) | Structured JSON logger, redaction list, audit chain, log shipping |

## Infrastructure

| Document | Description |
| -------- | ----------- |
| [backup-restore.md](./backup-restore.md) | Backup/restore drill, measured RPO/RTO, evidence |
| [multi-region.md](./multi-region.md) | Active-active routing, global event broadcast, RegionManager API |
| [disaster-recovery.md](./disaster-recovery.md) | Disaster recovery plan *(pending)* |
| [performance-tuning.md](./performance-tuning.md) | Tuning guidance *(pending)* |

## Deployment

| Platform | Document |
| -------- | -------- |
| General | [deployment/README.md](./deployment/README.md) |
| Docker | [deployment/docker.md](./deployment/docker.md) |
| Kubernetes | [deployment/kubernetes.md](./deployment/kubernetes.md) |
| AWS / GCP / Azure | [deployment/aws.md](./deployment/aws.md) / [deployment/gcp.md](./deployment/gcp.md) / [deployment/azure.md](./deployment/azure.md) |
| On-premise | [deployment/on-premise.md](./deployment/on-premise.md) |

## Runbooks

| Scenario | Document |
| -------- | -------- |
| Index | [runbooks/README.md](./runbooks/README.md) |
| Database failover / key rotation | [runbooks/database-failover.md](./runbooks/database-failover.md) / [runbooks/key-rotation.md](./runbooks/key-rotation.md) |
| Rate limits / incident / breach / tenant failover | [rate-limit-tuning.md](./runbooks/rate-limit-tuning.md) / [incident-response.md](./runbooks/incident-response.md) / [security-breach.md](./runbooks/security-breach.md) / [tenant-failover.md](./runbooks/tenant-failover.md) |
| Zero-downtime deploy / rollback | [zero-downtime-deployment.md](./runbooks/zero-downtime-deployment.md) / [emergency-rollback.md](./runbooks/emergency-rollback.md) |

## Security and compliance

| Document | Path |
| -------- | ---- |
| Security overview | [../security/README.md](../security/README.md) |
| Hardening / incident / DR (policy) | [../security/production-hardening.md](../security/production-hardening.md) / [../security/incident-response.md](../security/incident-response.md) / [../security/disaster-recovery.md](../security/disaster-recovery.md) |

## MFA migration

- [mfa-migration.md](./mfa-migration.md) — legacy-secret upgrade procedure (`npm run migrate:mfa`)

## Key identity-server endpoints

| Endpoint | Purpose |
| -------- | ------- |
| `GET /health/live` | Liveness; always 200 when process is up |
| `GET /health/ready` | Readiness; 200 if MongoDB connected, 503 otherwise |
| `GET /v1/admin/status` | Runtime status: issuer, uptime, metrics snapshot (ADMIN) |
| `POST /v1/admin/metrics/flush` | Flush buffered metrics to the configured exporter (ADMIN) |