# Production hardening

Production startup requires an HTTPS issuer, secure cookies, enabled signing
key rotation, and non-wildcard allowed origins. Secrets are injected through
the configured provider and are never committed or placed in frontend build
inputs.

Expose `/health/live` for process liveness and `/health/ready` only when
required durable dependencies are ready. Drain the HTTP listener before
closing Redis and MongoDB during shutdown. Protect health and metrics
endpoints from sensitive data exposure.

Before release, run typecheck, build, unit/security tests, secret scanning,
dependency audit, SBOM generation, container scan, and the Mongo/Redis
integration suite. Attach output and dependency versions to the release
record. Review alerts for authentication failures, refresh reuse, key
rotation, authorization denials, dependency health, and error rate.
