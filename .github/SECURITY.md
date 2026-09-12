# Security Policy

## Supported versions

Pezhwan is currently in development (0.1.x). Only the latest release receives
security fixes.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a vulnerability

Pezhwan takes security seriously. If you believe you have found a security
vulnerability in Pezhwan, we encourage you to let us know right away.

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Instead, report privately following our
[`SECURITY.md`](../SECURITY.md) guidance, which covers the disclosure
coordinator, our no-harassment policy for researchers, and the disclosure
process.

We will investigate all legitimate reports and do our best to quickly fix the
problem. If you have not received a reply within 5 business days, please follow
up again.

## Disclosure process

1. The issue is received and acknowledged within 5 business days.
2. A fix is prepared against the latest supported version.
3. A security advisory is drafted and a CVE is requested if warranted.
4. The fix is released and the advisory is published.

## Security-conscious development

Expected baseline before every Pezhwan release (see
[`docs/security-audit.md`](../docs/security-audit.md) and
[`.github/workflows/security.yml`](workflows/security.yml)):

- Unit, security, failure-injection, interop, and integration test suites.
- Secret scanning (Pezhwan scanner + Gitleaks).
- Dependency audit (`npm audit --audit-level=high`) and CycloneDX SBOM.
- Docker container build of the identity server.

Thank you for helping keep Pezhwan and its users safe.