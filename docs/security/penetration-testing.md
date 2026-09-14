# Penetration testing methodology

This document defines the scope, test categories, tools, and reporting
requirements for penetration testing the Pezhwan IAM stack. Align every test
with the STRIDE threat model in `docs/THREAT-MODEL.md` and record evidence
(timestamp, environment, reviewer) for each finding.

---

## 1. Scope

| Target             | Components                                                                       |
| ------------------ | -------------------------------------------------------------------------------- |
| Identity server    | `apps/identity-server` — auth, session, MFA, OAuth, rate-limit, admin endpoints  |
| Core SDK           | `packages/core` — auth engine, risk engine, session service, compliance services |
| Crypto SDK         | `packages/crypto` — Argon2id, RSA/RS256, TOTP, OTP, HIBP, HMAC, SRP-6a           |
| Express middleware | `packages/express` — CORS, CSRF, rate-limit, security headers, auth middleware   |
| React SDK + admin  | `packages/react`, `apps/admin-console` — token handling, policy management       |
| CI/CD              | `.github/workflows/` — `security.yml`, `ci.yml` gates                            |

## 2. STRIDE alignment

| STRIDE                 | Primary test categories                                  |
| ---------------------- | -------------------------------------------------------- |
| Spoofing               | Brute-force, session-theft, token-attacks, oauth-attacks |
| Tampering              | Injection, CSRF, privilege-escalation, tenant-escape     |
| Repudiation            | Audit-chain integrity, log completeness                  |
| Information Disclosure | CORS misconfig, secret-config, injection                 |
| Denial of Service      | Rate-limit-attack, injection (resource exhaustion)       |
| Elevation of Privilege | Privilege-escalation, tenant-escape, token-attacks       |

## 3. Automated test suites

Run the full security suite before every release and after any authentication,
OAuth, or session-management change:

```bash
npx vitest run tests/security/ --reporter=verbose
```

| Suite                          | Validates                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `brute-force.test.ts`          | 5-attempt lockout, 15-min cooldown, `retryAfterMs`, MFA lock counter                |
| `rate-limit-attack.test.ts`    | Fixed-window atomic counters, 429 on exhaustion, no bypass on Redis failure         |
| `injection.test.ts`            | NoSQL/SQL injection, XSS, prototype pollution on auth endpoints                     |
| `csrf.test.ts`                 | Double-submit `pezhwan_csrf` cookie vs `x-csrf-token` on unsafe methods             |
| `cors.test.ts`                 | Origin allowlist, wildcard+credentials blocked, 403 `ORIGIN_REJECTED`               |
| `session-theft.test.ts`        | Refresh-token reuse revokes family; stolen tokens rejected post-rotation            |
| `token-attacks.test.ts`        | `alg:none`/`HS256` confusion rejected, exp/claims enforced, unknown `kid` → 401     |
| `privilege-escalation.test.ts` | Role injection via JWT blocked; `tokenVersion` bump invalidates old tokens          |
| `tenant-escape.test.ts`        | Cross-tenant lookups blocked, wrong-tenant refresh rejected, per-tenant uniques     |
| `oauth-attacks.test.ts`        | PKCE downgrade, redirect mismatch, code replay, cross-client exchange rejected      |
| `secret-config.test.ts`        | Production invariants: HTTPS issuer, secure cookies, non-wildcard origins, rotation |

Run alongside: `packages/core/test/security.test.ts` (hashing, timing-safe
compare, JWT pinning, audit chain), the failure-injection suite (disk-full,
corrupt keys, HSM unavailable, Redis down), and the Mongo-backed integration
suite under `tests/integration/`.

## 4. Manual checks

Perform in a staging environment with real TLS, MongoDB, and Redis.

| Check                        | Method                                                               | Expected                                    |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------- |
| Port scan                    | `nmap -sV -p 4011 <host>`                                            | Only expected ports open                    |
| TLS config                   | `nmap --script ssl-enum-ciphers -p 443 <host>`                       | TLS 1.2+, no weak ciphers                   |
| Security headers             | `curl -sI https://<host>/`                                           | HSTS, `X-Frame-Options: DENY`, CSP, nosniff |
| CORS allowed origin          | `curl -H "Origin: https://allowed.com" https://<host>/v1/auth/login` | Normal response                             |
| CORS disallowed origin       | `curl -H "Origin: https://evil.com" https://<host>/v1/auth/login`    | 403 `ORIGIN_REJECTED`                       |
| Header/CORS error inspection | Browser devtools network tab                                         | No wildcard `Access-Control-Allow-Origin`   |
| OAuth redirect mismatch      | Manual authorize request with altered `redirect_uri`                 | `redirect_uri_mismatch`                     |
| OAuth code replay            | Redeem the same code twice                                           | Second redeem fails (atomic consume)        |
| Token `alg:none`/bad `kid`   | Forge JWT headers                                                    | 401 (algorithm pinned; `UNKNOWN_KEY`)       |
| Cross-tenant lookup          | Admin in tenant A queries a user ID from tenant B                    | Not found (scoped `findOne`)                |
| Cross-tenant refresh         | Refresh tenant A session through tenant B engine context             | `SESSION_CONTEXT_INVALID`                   |
| Decoy trigger                | Login attempt with a registered decoy handle                         | Critical audit event raised                 |

## 5. Tooling

| Tool                               | Purpose                                    | Integration                 |
| ---------------------------------- | ------------------------------------------ | --------------------------- |
| `scripts/secret-scan.mjs`          | Pre-commit heuristic secret detection      | Git hook + CI               |
| `gitleaks` (`gitleaks-action`)     | Deep secret scanning with entropy analysis | CI (`security.yml`)         |
| `npm audit`                        | Known vulnerabilities in dependencies      | CI + `dependency-audit.mjs` |
| `nmap` / `curl` / browser devtools | Ports, TLS, headers, CORS verification     | Manual pre-release          |
| `vitest`                           | All automated security suites              | CI + local                  |

## 6. Evidence capture

For every run record: date/UTC timestamp, environment (OS, Node, MongoDB,
Redis versions), commit SHA, full command output, and reviewer. Store under a
gitignored `security-evidence/` directory and attach to the release record.

```bash
npx vitest run tests/security/ --reporter=verbose 2>&1 | tee security-evidence/security-$(date +%Y%m%d).log
node scripts/secret-scan.mjs --ci 2>&1 | tee security-evidence/secret-scan-$(date +%Y%m%d).log
npm audit --json 2>&1 | tee security-evidence/npm-audit-$(date +%Y%m%d).json
```

## 7. Reporting

1. **Executive summary** — overall risk posture, go/no-go recommendation
2. **Findings table** — ID, severity (Critical/High/Medium/Low/Informational),
   STRIDE category, description, evidence, remediation status — follow the
   `F{n}` numbering in `docs/security-audit.md`
3. **Test coverage matrix** — STRIDE categories exercised versus not
4. **Gate pass/fail** — `scripts/security-audit.mjs` must exit 0
5. **Reviewer sign-off** — name, date, environment

## 8. Frequency

| Trigger                                         | Required tests                                   |
| ----------------------------------------------- | ------------------------------------------------ |
| Pre-release (every version bump)                | Full automated suite + manual checks             |
| After auth/session/OAuth/key-management changes | Targeted suites + manual OAuth/session checks    |
| Quarterly                                       | Full suite + manual checks + tabletop drill      |
| After dependency update or incident             | Automated suites + `npm audit` + targeted manual |
