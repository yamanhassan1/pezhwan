# Security Policy

Pezhwan (پېژوان) is an identity and access management SDK, so security is taken
very seriously. This document describes how security issues are handled.

The repository copy of this policy lives in the root `SECURITY.md` and is
mirrored as `.github/SECURITY.md` so GitHub displays it in the Security tab.

## Supported versions

Pezhwan is currently in development (`0.1.x`). Only the latest release receives
security fixes. Older releases are fixed only by upgrading.

| Version | Supported                          |
| ------- | ---------------------------------- |
| 0.1.x   | Latest patch of the latest release |
| < 0.1   | Not supported                      |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report suspected vulnerabilities privately to the maintainers at:

```
<security-contact@pezhwan.example — replace with the real contact address>
```

What to include in a report:

- Affected component and version(s)
- A clear description of the vulnerability and its security impact
- Steps to reproduce, or a proof-of-concept if available
- Any suggested mitigation, if you have one

You should receive an acknowledgement within **5 business days**. If you have
not received a reply within that window, please follow up on the same thread.

## Responsible disclosure

Security researchers acting in good faith are welcome, and will not be harassed
or threatened with legal action, provided they:

- Do not exfiltrate, damage, or destructively modify data beyond what a PoC
  requires
- Do not publicly disclose the issue before a fix is released or a disclosure
  window has been agreed
- Report through the private channel above

We coordinate with researchers on a mutually agreeable disclosure timeline.
Standard practice is a 90-day disclosure window from the initial report, with
extensions possible for complex fixes.

## Timeframes

| Milestone                                          | Target                         |
| -------------------------------------------------- | ------------------------------ |
| Initial acknowledgement                            | Within 5 business days         |
| Status update after triage                         | Within 10 business days        |
| Fix for critical vulnerabilities on latest release | Within 30 days, often sooner   |
| Coordinated public disclosure                      | Within 90 days of confirmation |

## Disclosure process

1. The report is received, acknowledged, and triaged.
2. The issue is confirmed and its severity assessed.
3. A fix is prepared against the latest supported version.
4. A security advisory is drafted and a CVE is requested if warranted.
5. The fix is released and the advisory is published.
6. The issue is closed and, where useful, recorded in
   `docs/security/` so future releases keep the evidence.

## Hardening expectations

Pezhwan follows a fail-closed security model: any uncertainty about an
identity resolves to "not authenticated." Core controls include Argon2id
password hashing, asymmetric JWT signing with JWKS and key rotation,
short-lived access tokens with rotating refresh tokens and reuse detection,
tenant/application boundary enforcement, strict CORS and CSRF protections,
rate limiting and lockout, and tamper-evident audit logging.

Every release must pass, at minimum:

- Unit, security, failure-injection, interop, and integration test suites
- Secret scanning (Pezhwan scanner plus Gitleaks in CI)
- Dependency audit (`npm audit --audit-level=high`) and CycloneDX SBOM
- Lint, format, build, and typecheck gates
- A Docker build of the reference identity server

See the security documentation for the full control surface:

- [docs/security/README.md](docs/security/README.md) — security controls and
  deployment hardening
- [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md) — STRIDE threat model
- [docs/security-audit.md](docs/security-audit.md) — audit record and
  remediation tracking
- [docs/security/compliance/](docs/security/compliance/) — compliance notes
  (GDPR, HIPAA, PCI DSS, SOC 2, CCPA, ISO 27001, FedRAMP)

## Deployment responsibility

Running a hardened production deployment is the deployer's responsibility.
Production deployments require secret management, TLS termination, network
isolation, proper key rotation, monitoring, and backup/restore procedures per
the operational documentation. See
[PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) for a candid assessment of
what is and is not production-ready.

Thank you for helping keep Pezhwan and its users safe.
