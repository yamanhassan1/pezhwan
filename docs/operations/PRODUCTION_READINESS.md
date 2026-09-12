# Production Readiness (Operations View)

Operational summary of the Pezhwan identity platform's readiness for
production. This is the **ops-focused companion** to the root scorecard at
[`../../PRODUCTION_READINESS.md`](../../PRODUCTION_READINESS.md) — operators
should consult both.

> **Assessment date:** 2026-09-04 | **Rating:** 8.2/10 | **Decision:** NO-GO
> (target 9.9/10 for public-internet use)

---

## Scorecard summary

| Category | Score | Ops relevance |
| -------- | -----: | ------------- |
| Security and secrets | 8.5 | Secret management, env injection, key rotation |
| Cryptography and JWT | 8.5 | Signing-key persistence, rotation interval, JWKS cache |
| Auth and MFA/OTP | 8.0 | OTP provider chain; live send not yet executed |
| Authorization and tenancy | 8.0 | Tenant-boundary enforcement across auth paths |
| Session security | 8.0 | Atomic refresh rotation, reuse detection, TTLs |
| OAuth/OIDC | 7.5 | Real-provider interop testing not completed |
| MongoDB / Redis | 7.5 / 7.5 | Replica-set HA proof outstanding; durable rate-limit fallback proven |
| Reliability and scalability | 6.0 | No load suite, no throughput/latency baseline |
| Observability and operations | 7.0 | Metrics surface defined; dashboards/alerts not validated |
| Disaster recovery | 7.0 | Backup/restore executed; signing-key recovery pending |
| Testing and failure verification | 7.0 | 380+ tests; failure-injection gaps remain |
| CI/CD and supply chain | 7.0 | No lint/coverage/dependency-review/container-scan gates |
| Documentation | 8.0 | Comprehensive; ops runbooks stubbed |

**Overall: 7.5/10** (root scorecard) | **8.2/10** (evidence-based assessment)

---

## Remaining blockers for production approval

### 1. MongoDB replica-set HA proof

Integration tests use `mongodb-memory-server`; no live replica-set failover has
been run. Operators must verify:

- Session writes survive a primary step-down.
- Refresh-rotation atomicity (`sequence: 'rotating'`) holds across elections.
- The audit `sequence` allocator and JWKS cache stay consistent after elections.

**Evidence:** Automated test output or a documented drill showing primary kill
and re-election with zero failed auth requests against each invariant.

### 2. Live OTP provider send

The `OtpDeliveryManager` (retry, circuit breaker, failover chain) is wired and
unit-tested; production config forbids console/mock providers. **No real
send has been executed.** Operators must verify:

- Real email (`nodemailer-smtp`, `sendgrid`, `aws-ses`) and SMS (`twilio-sms`)
  transports configured in env.
- A full register/login/OTP/verify flow against a real mailbox and phone.
- Circuit-breaker state transitions visible in `/health/ready` after a
  deliberate provider timeout.

**Evidence:** End-to-end flow result with delivery timestamps and the
`/health/ready` provider report.

### 3. Load and failure-injection infrastructure

No load-test suite or systematic failure-injection matrix exists. Operators
must verify:

- Throughput (req/s) and latency (p50/p95/p99) baseline under expected peak load.
- Behavior under injected MongoDB drops, Redis outages, and signing-key file
  corruption (atomic-rename self-healing).
- That rate-limit enforcement stays shared across instances during a Redis
  outage (durable MongoDB counter fallback).

**Evidence:** Load report plus a failure-injection matrix with recovery
outcome per dependency.

### 4. Live-data MFA migration

`scripts/migrate-mfa-secrets.mjs` (`--dry-run`/`--apply`/`--validate`/
`--rollback`) is delivered and documented but **not run on real data**.
Operators must verify:

- `--dry-run` counts match expectations.
- `--apply --batch-size 5000 --validate` during a low-traffic window.
- Spot-check 3-5 users in an authenticator app before/after; confirm TOTP codes
  are unchanged and `mfaSecretsBackup` + `--rollback` behave.

**Evidence:** Dry-run and apply output with validation pass and user spot-checks.

---

## What operators must verify in every deployment

| Area | Check | Ref |
| ---- | ----- | --- |
| Secrets | No secrets in repo/env; vault in prod | [../security/secrets-management.md](../security/secrets-management.md) |
| Signing keys | Persisted path + rotation enabled | [../security/key-management.md](../security/key-management.md) |
| MongoDB | TLS + auth; replica set running | `.env.example` |
| Redis | Sentinel/cluster for multi-instance | `redis-manager.ts` |
| CORS / cookies | Prod origins only; `PEZHWAN_COOKIE_SECURE=true` | `.env.example` |
| Rate limits | Tuned to traffic; WAF in front | [../security/rate-limiting.md](../security/rate-limiting.md) |
| OTP providers | Real email/SMS enforced | [./mfa-migration.md](./mfa-migration.md) |
| Health probes | `/health/live`, `/health/ready` wired to orchestrator | `apps/identity-server/src/server.ts` |
| Shutdown | `SIGINT`/`SIGTERM` drain connections | `server.ts:316-354` |
| Audit retention | `setRetentionDays()` set per policy | `audit.service.ts` |
| Observability | Metrics exporter wired; logs shipped | [monitoring.md](./monitoring.md), [logging.md](./logging.md) |

---

## Path to 9.5+/10

| Gap | Target state | Current |
| --- | ------------ | ------- |
| Replica-set HA | Automated failover test in CI/drill | Not started |
| OTP live send | End-to-end flow with real provider | Wired, not executed |
| Load testing | Baseline p95/p99 under peak traffic | Not started |
| Failure injection | Systematic dependency failure matrix | Not started |
| CI gates | Lint, coverage, dependency review, container scan | Not implemented |
| Alert/dashboard validation | Tested in staging before prod | Configs not populated |

---

## References

- Root scorecard: [`../../PRODUCTION_READINESS.md`](../../PRODUCTION_READINESS.md)
- Known problems: [`../../problems.md`](../../problems.md)
- [backup-restore.md](./backup-restore.md) · [mfa-migration.md](./mfa-migration.md) · [multi-region.md](./multi-region.md)