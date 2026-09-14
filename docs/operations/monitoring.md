# Monitoring

Guide to collecting and visualising Pezhwan metrics. The stack is a Prometheus

- Grafana + Loki compose bundle under `infrastructure/docker/monitoring/`.

> **Status:** The reference implementation exposes a defined metrics surface
> and health endpoints, but the compose monitoring configs (`prometheus.yml`,
> `loki-config.yml`, `datasources.yml`, `dashboards/pezhwan.json`) are empty
> placeholders. Populate them as described below.

---

## Metrics surface

Pezhwan tracks counters through `MetricsRegistry`
(`packages/core/src/services/metrics.service.ts`), a zero-dependency
in-process registry. `runtime.metrics.increment(name, by)` bumps a counter,
`snapshot()`/`get(name)` read it, `uptimeSeconds()` reports process uptime.

| Metric name                                      | Meaning                         |
| ------------------------------------------------ | ------------------------------- |
| `auth.login.success` / `auth.login.failed`       | Successful / failed logins      |
| `auth.register.total`                            | New registrations               |
| `auth.refresh.success` / `auth.refresh.reuse`    | Rotations / rejected reuse      |
| `auth.otp.sent` / `auth.otp.failed`              | OTP send attempts / failures    |
| `auth.mfa.success` / `auth.mfa.failed`           | MFA verify successes / failures |
| `auth.oauth.authorized` / `auth.oauth.exchanged` | OAuth grants / exchanges        |
| `auth.api_key.total`                             | API-key-authenticated requests  |
| `authz.denied`                                   | Authorization denials           |
| `ratelimit.hit`                                  | Rate-limit rejections           |
| `security.event`                                 | Security events (audit)         |
| `token.revoked`                                  | Token revocations               |

### Metric pattern

Monitor the auth signals as **pairs**: login success/failed, otp sent/failed,
mfa success/failed, refresh success/reuse. The ratios are the primary security
signals (credential stuffing, OTP brute force, token reuse).

### Export paths

1. **Prometheus text endpoint (preferred):** set `runtime.metrics.setExporter(...)`
   to render the `MetricCounter[]` snapshot in Prometheus text format and serve
   it on a dedicated `/metrics` route (the reference server does not yet ship one).
2. **OpenTelemetry:** point `PEZHWAN_OTEL_ENDPOINT` at a collector with an
   exporter that flushes counters; `POST /v1/admin/metrics/flush` triggers an
   out-of-band flush (ADMIN role, **not** the scrape path).

### Scrape targets

| Target           | Endpoint                          | Notes                               |
| ---------------- | --------------------------------- | ----------------------------------- |
| Identity server  | `/metrics` (add) or OTLP exporter | Private network / mTLS              |
| Node exporter    | `:9100/metrics`                   | Host CPU/mem/disk/net               |
| MongoDB Exporter | `:9216/metrics`                   | Connections, oplog lag, replication |
| Redis Exporter   | `:9121/metrics`                   | Clients, memory, evictions          |

## Prometheus

Write `prometheus.yml` with: `scrape_interval: 15s`, a job for the identity
server metrics endpoint, jobs for node/MongoDB/Redis exporters, an
`evaluation_interval` aligned with the alert `for` clauses, and
`rule_files: [alerts.yml]`.

## Grafana dashboard

`dashboards/pezhwan.json` is a placeholder. Recommended panels
(`rate(counter[5m])`):

| Panel                           | Recommended query                                                    |
| ------------------------------- | -------------------------------------------------------------------- |
| Login rate                      | `rate(auth_login_success_total[5m])`                                 |
| Login failure rate              | `rate(auth_login_failed_total[5m])`                                  |
| OTP failure ratio               | `rate(auth_otp_failed_total[5m]) / rate(auth_otp_sent_total[5m])`    |
| MFA failure ratio               | `rate(auth_mfa_failed_total[5m]) / rate(auth_mfa_success_total[5m])` |
| Refresh reuse                   | `rate(auth_refresh_reuse_total[5m])`                                 |
| Authz denials / rate-limit hits | `rate(authz_denied_total[5m])` / `rate(ratelimit_hit_total[5m])`     |
| Security events                 | `increase(security_event_total[5m])`                                 |
| Uptime                          | `time() - process_start_time_seconds`                                |

Configure the Prometheus and Loki datasources in `grafana/datasources.yml`.

## Loki log aggregation

`loki-config.yml` runs local Loki storage; ship logs from Promtail/Grafana Alloy
agents beside each identity server. Query by `{service="pezhwan"}` and filter
with `| json`. Keep low-cardinality labels only; keep requestIds in the line
content. See [logging.md](./logging.md).

## Kubernetes (if using the helm chart)

`infrastructure/kubernetes/helm/pezhwan/templates/` has no `ServiceMonitor`
yet. For Prometheus Operator, add a `ServiceMonitor` selecting the identity
server `Service` on `:4011` with the metrics path; otherwise scrape via a
static config pointing at pod IPs.

## Metrics endpoint security

- Never expose `/metrics` or `/v1/admin/status` (which returns the raw counter
  snapshot) to the public internet.
- Keep scrape on private network / mTLS; counters contain no PII but reveal
  traffic patterns.
- `POST /v1/admin/metrics/flush` requires `ADMIN` and is rate limited.

## Reference

- Registry: `packages/core/src/services/metrics.service.ts`
- Admin routes (status/flush): `packages/express/src/routes/admin.routes.ts`
- Health endpoints: `apps/identity-server/src/server.ts:139-175`
- Env: `PEZHWAN_OTEL_ENDPOINT`, `PEZHWAN_LOG_LEVEL` (`.env.example`)
