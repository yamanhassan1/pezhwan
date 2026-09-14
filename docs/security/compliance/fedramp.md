# FedRAMP compliance

Pezhwan ships no built-in FedRAMP service. This document maps the NIST 800-53
controls relevant to an IAM system and identifies where Pezhwan provides
support. Use it as the FedRAMP gap-analysis starting point.

---

## 1. Scope and impact levels

FedRAMP authorization applies when Pezhwan is deployed as part of a cloud
service offered to federal agencies. Identity/authentication functions
typically place the deployment at **Moderate** impact (325-control baseline) at
minimum; High adds 421 controls, FIPS crypto, and continuous monitoring.

## 2. NIST 800-53 control families

### AC — Access Control

| Control | Requirement                           | Pezhwan implementation                           |
| ------- | ------------------------------------- | ------------------------------------------------ |
| AC-2    | Account management                    | Tenant-scoped lifecycle, lockout, revocation     |
| AC-3    | Access enforcement                    | RBAC deny-by-default, ABAC                       |
| AC-4    | Information flow                      | CORS allowlist, CSRF, tenant boundaries          |
| AC-5/6  | Separation of duties, least privilege | SoD checks, admin gates, server-side permissions |
| AC-7    | Unsuccessful logins                   | 5-attempt lockout, 15-min cooldown               |
| AC-11   | Device lock                           | Session idle + absolute expiry                   |
| AC-17   | Remote access                         | TLS required, HTTPS issuer enforced              |

### AU — Audit and Accountability

| Control | Requirement                  | Pezhwan implementation                                         |
| ------- | ---------------------------- | -------------------------------------------------------------- |
| AU-2/3  | Audit events and content     | Auth/risk/compliance events with actor, target, correlation ID |
| AU-4    | Storage capacity             | `AuditService.setRetentionDays()`                              |
| AU-6    | Review/reporting             | Queryable audit + risk trend analysis                          |
| AU-9/10 | Protection / non-repudiation | `prevHash` hash chain (best-effort in HA — G7)                 |
| AU-12   | Audit generation             | Every security action logged                                   |

### IA — Identification and Authentication

| Control | Requirement                | Pezhwan implementation                          |
| ------- | -------------------------- | ----------------------------------------------- |
| IA-2    | Identification/auth (MFA)  | Argon2id, MFA, adaptive risk-based auth         |
| IA-2(1) | MFA to privileged accounts | Admin role MFA when enabled                     |
| IA-2(8) | Device-bound accounts      | WebAuthn credential binding                     |
| IA-5    | Authenticator management   | Password hashing, token rotation, key lifecycle |
| IA-5(1) | Password-based auth        | Argon2id, strength/history/lockout              |
| IA-5(6) | Authenticator protection   | SHA-256 hashed secrets, `select:false`          |
| IA-5(7) | No embedded authenticators | Opaque tokens, short-lived JWTs                 |
| IA-6    | Authenticator feedback     | Generic errors, `retryAfterMs` (no enumeration) |
| IA-7    | Crypto module verification | RS256 pinned, no `alg:none`                     |
| IA-8    | Non-org users              | OAuth client tenant/application scoping         |

### SC — System and Communications Protection

| Control  | Requirement             | Pezhwan implementation                                   |
| -------- | ----------------------- | -------------------------------------------------------- |
| SC-7     | Boundary protection     | CORS, security headers, rate limiting                    |
| SC-8     | Transmission            | TLS required, HTTPS issuer                               |
| SC-12/13 | Key management / crypto | KeyStore lifecycle, rotation, JWKS; Argon2id/RSA/SHA-256 |
| SC-17    | PKI certificates        | JWKS public key distribution, RSA key pairs              |
| SC-23    | Session authenticity    | Token-version binding, session family rotation           |

### Other families

- **CM-2/3/6** — Zod-validated baseline config, `recordChange()` evidence,
  secure defaults and body/cookie/cors hardening.
- **CP-9/10** — backup verification scripts, restore drills, key persistence
  across restarts, Mongo as source of truth.

## 3. FIPS 140-2/3

FedRAMP requires FIPS-validated crypto. Pezhwan uses `node:crypto`
(RSA/SHA-256, `timingSafeEqual`) and Argon2id. Node can run FIPS mode when built
with `--openssl-fips`; deployments should:

1. Build/runtime with a FIPS-validated OpenSSL distribution
2. Confirm `crypto.getFips() === 1` at startup
3. Record the FIPS validation certificate number

Pezhwan does not bundle FIPS modules — this is a deployment-level requirement.

## 4. Boundary and responsibilities

| Component                     | Boundary     | Responsibility                    |
| ----------------------------- | ------------ | --------------------------------- |
| Identity server + Mongo/Redis | In scope     | Application controls (AC, IA, AU) |
| TLS proxy                     | In scope     | SC-8 compliance                   |
| OS/runtime/cloud infra        | In scope     | Hardening, patching, physical     |
| Pezhwan source                | Out of scope | Not a cloud service               |

## 5. Documentation and authorization process

FedRAMP requires a System Security Plan (SSP), Plan of Action and Milestones
(POA&M), continuous monitoring (monthly scans, annual pen test, config review),
an incident response plan, and a configuration management plan. Process:
**prepare** (SSP, gap mapping) → **assess** (3PAO assessment) → **authorize**
(ATO) → **monitor** (continuous) → **reauthorize** (3 years / material change).

## 6. Deployment checklist

- [ ] Impact level determined; FIPS crypto configured or exception documented
- [ ] SSP completed with control-by-control details
- [ ] POA&M for open findings; incident response procedure tested
- [ ] Continuous monitoring plan defined (scans, pen test, config review)
