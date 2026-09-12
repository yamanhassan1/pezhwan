# Operational security checklist

Pre-deployment checklist for every Pezhwan release. Every item must be
checked before the deployment is approved. Record the checker name, date,
and environment for each run.

---

## Pre-deployment

- [ ] `PEZHWAN_ISSUER` uses `https://`
- [ ] `PEZHWAN_COOKIE_SECURE=true`
- [ ] `PEZHWAN_COOKIE_SAMESITE` set to `lax` or `strict`
- [ ] `PEZHWAN_SIGNING_KEY_ROTATION_MS` is set (rotation enabled)
- [ ] `PEZHWAN_ALLOWED_ORIGINS` contains no wildcard (`*`) entries
- [ ] All required environment variables validated by Zod schema at startup
  (`apps/identity-server/src/config/env.ts`)
- [ ] `PEZHWAN_BODY_LIMIT` set (default `100kb` acceptable)
- [ ] Redis configured and `RedisManager.isHealthy()` returning true
- [ ] MongoDB replica set running and `initKeyPersistence()` completed

## Secret management

- [ ] No secrets in `.env.example` (placeholders only)
- [ ] No secrets committed to repository
- [ ] `node scripts/secret-scan.mjs --ci` passes with zero findings
- [ ] `gitleaks` scan passes in CI
- [ ] Secrets injected through configured `SecretProvider` (env, file, or vault)
- [ ] No private keys or `*.pem` files tracked in git
- [ ] No `.env` files tracked in git
- [ ] Production secret rotation procedure documented and tested

## Dependencies

- [ ] `npm audit` returns zero critical/high vulnerabilities
- [ ] `node scripts/dependency-audit.mjs` passes
- [ ] No unapproved licenses in production dependency tree
- [ ] `package-lock.json` committed and up to date

## Testing gates

- [ ] `npm run build` succeeds across all workspaces
- [ ] `npm run test -w @pezhwan/core` passes (20/20 or better)
- [ ] `npm run test -w @pezhwan/express` passes (9/9 or better)
- [ ] Full security suite passes: `npx vitest run tests/security/`
- [ ] Integration suite passes: `npm run test:integration`
- [ ] Failure-injection suite passes
- [ ] `node scripts/security-audit.mjs` exits 0 (all 8 checks PASS)
- [ ] Cross-tenant isolation tests pass (no `SESSION_CONTEXT_INVALID` failures)
- [ ] Refresh-token reuse detection test passes (family revoked on reuse)
- [ ] MFA brute-force lockout test passes (5 attempts, 15-min lock)

## Monitoring and alerting

- [ ] Alerts configured for authentication failure spikes
- [ ] Alerts configured for refresh-token reuse detection
- [ ] Alerts configured for signing key rotation events
- [ ] Alerts configured for authorization denial rate increases
- [ ] Audit service logging non-blocking (`audit.service.ts` fire-and-forget)
- [ ] Audit chain `prevHash` integrity verified
- [ ] Decoy honeypot hit alerts configured
- [ ] Risk engine block-verdict alerts configured

## Runtime security

- [ ] CORS allowlist contains exact origins (no wildcards)
- [ ] CSRF double-submit cookie enforced on auth, MFA, and verify routes
- [ ] Security headers present: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CSP, HSTS
- [ ] Rate limits active on all auth/session/OAuth/MFA endpoints
- [ ] `accountState.validate()` failing closed on dependency errors (503, not 401)
- [ ] Token algorithm pinned to RS256 (no `alg:none`, no `HS256`)
- [ ] Argon2id configured (timeCost 3, memoryCost 64 MiB, parallelism 1)

## Backup and recovery

- [ ] MongoDB backups configured with encryption at rest
- [ ] Backup restore tested: `node scripts/verify-backup.mjs`
- [ ] Restore drill completed: `node scripts/restore-drill.mjs`
- [ ] RPO and RTO documented
- [ ] Signing key backup and restore procedure verified

## Runbook readiness

- [ ] Incident response runbook exists (`docs/security/incident-response.md`)
- [ ] Key rotation procedure documented and tested
- [ ] Emergency key revocation procedure documented
- [ ] Tenant lockout and recovery procedure documented
- [ ] On-call escalation path defined
- [ ] Tabletop exercise completed within last 90 days

## Compliance gates

- [ ] GDPR export (`gdpr.exportData`) tested for sample user
- [ ] GDPR erasure (`gdpr.erase`) tested with soft-delete and hard-purge paths
- [ ] HIPAA audit trail (`hipaa.recordPhiAccess`) logging correctly
- [ ] SOC 2 change management (`soc2.recordChange`) operational
- [ ] CCPA household right-to-know (`ccpa.rightToKnow`) returning correct profiles
- [ ] All compliance actions audited with timestamps and correlation IDs

## Release record

For every release, record the following in the release log:

- Release version and commit SHA
- Date and environment (OS, Node.js, MongoDB, Redis versions)
- All checklist items checked with reviewer name
- Output of `security-audit.mjs`, `secret-scan.mjs --ci`, and `npm audit`
- Security suite test count (pass/fail)
- Integration suite test count (pass/fail)
- Any deviations or exceptions documented with justification and approver
