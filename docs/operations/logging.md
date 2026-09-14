# Logging

Pezhwan emits structured JSON logs through a zero-dependency logger
(`packages/core/src/services/logger.service.ts`), writes a tamper-evident
audit chain to MongoDB, and can ship both to Loki or any JSON collector.

---

## Structured log format

Every line is a single JSON object:

| Field     | Type                          | Description                                    |
| --------- | ----------------------------- | ---------------------------------------------- |
| `ts`      | string                        | ISO 8601 emit time                             |
| `level`   | `debug`/`info`/`warn`/`error` | Ordered severity                               |
| `service` | string                        | Defaults to `pezhwan`; set via `serviceName`   |
| `env`     | string                        | Environment tag (optional)                     |
| `message` | string                        | Human-readable message                         |
| `...`     | object                        | Context + caller fields, redacted at emit time |

Levels filter at emit: `debug < info < warn < error`. Set with
`PEZHWAN_LOG_LEVEL` (default `info`).

## Correlation: requestId / correlationId

- `requestContext()` in `packages/express/src/security.ts` assigns a requestId
  from the inbound `X-Request-Id` header or generates an RFC 4122 v4 UUID via
  `newRequestId()` (`logger.service.ts:184`).
- Handlers receive a child logger (`req.log`) whose context carries the
  requestId, so every line in a request is traceable end to end.
- `logger.child(fields)` merges context into a new logger; nested objects are
  re-checked at emit time.

## Redaction

A default key set in `logger.service.ts:19-61` masks matching nested keys
(case-insensitive, recursive, cycle-safe) as `[REDACTED]`; the `redact` option
adds project keys.

| Category     | Keys                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Credentials  | `password`, `passwordhash`, `sessionid`, `sessiontoken`, `bearertoken`                             |
| Tokens       | `accesstoken`, `refreshtoken`, `token`, `tokenhash`, `apikey`, `api_key`                           |
| Secrets      | `secret`, `clientsecret`, `clientsecrethash`, `oauthclientsecret`, `signingkey`, `privatekey`      |
| MFA / OTP    | `mfarecoverycode`, `mfasecret`, `otp`, `totp`, `code`, `codehash`, `codeverifier`, `codechallenge` |
| HTTP auth    | `authorization`, `cookie`, `set-cookie`, `x-csrf-token`                                            |
| Conn strings | `connectionstring`, `mongodburi`, `redisurl`, `databaseurl`                                        |
| Cloud keys   | `awssecretaccesskey`, `firebaseserviceaccount`                                                     |

Logging never crashes the caller: sink and exporter failures are swallowed.

## Audit log separation (security events)

Security events go to an **append-only MongoDB collection**, separate from the
application log stream (`packages/core/src/services/audit.service.ts`):

- `AuditService.log()` assigns a strictly-increasing global `sequence` via an
  atomic `$inc` on the `audit-sequences` counter, so concurrent writers never
  collide and the chain cannot fork.
- Each entry stores `hash` (SHA-256 of `prevHash` + canonical event) and
  `prevHash` (root = 64 zero bytes) — the tamper-evidence chain.
- `setRetentionDays(days)` creates an idempotent TTL index on `expireAt`; an
  optional external `AuditSink` forwards a redacted summary to a SIEM.
  Audit writes/sink failures are swallowed so logging never blocks auth.

## Shipping options

| Option          | Mechanism                                                               |
| --------------- | ----------------------------------------------------------------------- |
| Console + agent | JSON on stdout; ship with Promtail, Grafana Alloy, Fluent Bit, Filebeat |
| Logger exporter | Async `exporter(line)` hook for OTLP/direct ingestion (best-effort)     |
| Audit sink      | `AuditService.setSink()` for security events to the SIEM                |

## Loki ingestion

`loki-config.yml` runs local Loki storage behind the compose bundle. Label
streams with `service="pezhwan"` and `env`; keep requestIds **in the line**
(high-cardinality IDs are not labels). Query with
`{service="pezhwan"} | json`.

## Retention recommendations

| Stream                           | Retention                  | Rationale                            |
| -------------------------------- | -------------------------- | ------------------------------------ |
| App logs (`debug`/`info`)        | 7-14 days                  | Operational diagnostics              |
| `warn`/`error` + security events | 30-90 days                 | Incident forensics                   |
| Audit chain (MongoDB)            | Per compliance (1-7 years) | Evidence; TTL via `setRetentionDays` |

Comply with the approved data-handling policy: never log raw tokens, passwords,
OTP codes, or client secrets; preserve logs and correlate by requestId during
incidents (`docs/security/incident-response.md`).

## Reference

- Logger: `packages/core/src/services/logger.service.ts`
- Request context / child logger: `packages/express/src/security.ts`
- Audit service: `packages/core/src/services/audit.service.ts`
- Env: `PEZHWAN_LOG_LEVEL`, `PEZHWAN_REQUEST_LOGGING`, `PEZHWAN_OTEL_ENDPOINT` (`.env.example`)
