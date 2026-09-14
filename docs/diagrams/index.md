# PEZHWAN Diagrams

Architecture, sequence, and data model diagrams for the PEZHWAN IAM SDK.

Diagrams are defined as Mermaid blocks inside markdown sources. `@mermaid-js/mermaid-cli`
renders each block to **SVG + PNG** in this directory via
[`scripts/render-diagrams.mjs`](../../scripts/render-diagrams.mjs).

## Diagram Index

Source files carry the `NN-docs-…` prefix; the rendered output keeps the same
stem (`.svg` / `.png`).

| Diagram                | Source                                             | Rendered                                                                  | Description                                                               |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| System Overview        | [system-overview.md](./system-overview.md)         | [system-overview.svg](./16-docs-diagrams-system-overview-1.svg)           | High-level architecture: callers, server internals, external dependencies |
| Package Dependencies   | [package-dependency.md](./package-dependency.md)   | [package-dependency.svg](./17-docs-diagrams-package-dependency-1.svg)     | Layered monorepo package graph + runtime object graph                     |
| Auth Flow (login)      | [auth-flow.md](./auth-flow.md)                     | [auth-flow-1.svg](./19-docs-diagrams-auth-flow-1.svg)                     | Login (password + MFA gate)                                               |
| Auth Flow (register)   | [auth-flow.md](./auth-flow.md)                     | [auth-flow-2.svg](./20-docs-diagrams-auth-flow-2.svg)                     | Register + enum-safe duplicate handling                                   |
| Auth Flow (OTP)        | [auth-flow.md](./auth-flow.md)                     | [auth-flow-3.svg](./21-docs-diagrams-auth-flow-3.svg)                     | Passwordless OTP send/verify/login                                        |
| Refresh Rotation       | [refresh-rotation.md](./refresh-rotation.md)       | [refresh-rotation-1.svg](./22-docs-diagrams-refresh-rotation-1.svg)       | Single-use rotation, reuse → family revocation                            |
| Session Lifecycle      | [refresh-rotation.md](./refresh-rotation.md)       | [refresh-rotation-2.svg](./23-docs-diagrams-refresh-rotation-2.svg)       | `active → rotating → replaced / revoked / expired` state machine          |
| Session Family Chain   | [refresh-rotation.md](./refresh-rotation.md)       | [refresh-rotation-3.svg](./24-docs-diagrams-refresh-rotation-3.svg)       | Chain visualization + cascade revoke                                      |
| OAuth + PKCE           | [oauth-flow.md](./oauth-flow.md)                   | [oauth-flow-1.svg](./25-docs-diagrams-oauth-flow-1.svg)                   | Auth code + PKCE exchange + federation                                    |
| Data Model (ER)        | [data-model.md](./data-model.md)                   | [data-model-1.svg](./26-docs-diagrams-data-model-1.svg)                   | All entities, relationships, indexes                                      |
| Deployment             | [deployment.md](./deployment.md)                   | [deployment-1.svg](./27-docs-diagrams-deployment-1.svg)                   | Multi-region active-active topology                                       |
| Stateless Verification | [deployment.md](./deployment.md)                   | [deployment-2.svg](./28-docs-diagrams-deployment-2.svg)                   | Local JWT verify + Redis/Mongo fallback                                   |
| Security Layers        | [security-layers.md](./security-layers.md)         | [security-layers-1.svg](./29-docs-diagrams-security-layers-1.svg)         | 7-layer defense-in-depth                                                  |
| Fail-Closed Default    | [security-layers.md](./security-layers.md)         | [security-layers-2.svg](./30-docs-diagrams-security-layers-2.svg)         | Auth decision tree (401/503, never silent-allow)                          |
| Caching Strategy       | [caching-strategy.md](./caching-strategy.md)       | [caching-strategy-1.svg](./31-docs-diagrams-caching-strategy-1.svg)       | 4-tier cache hierarchy (edge → Mongo)                                     |
| Middleware Pipeline    | [middleware-pipeline.md](./middleware-pipeline.md) | [middleware-pipeline-1.svg](./32-docs-diagrams-middleware-pipeline-1.svg) | Per-request security pipeline                                             |
| Middleware Map         | [middleware-pipeline.md](./middleware-pipeline.md) | [middleware-pipeline-2.svg](./33-docs-diagrams-middleware-pipeline-2.svg) | Global vs selective vs per-route middleware                               |
| MFA Flow               | [mfa-flow.md](./mfa-flow.md)                       | [mfa-flow-1.svg](./34-docs-diagrams-mfa-flow-1.svg)                       | TOTP enrollment, gated login, disable                                     |
| Observability          | [observability.md](./observability.md)             | [observability-1.svg](./35-docs-diagrams-observability-1.svg)             | Metrics, tracing, logging, alerts                                         |
| Trace Span Hierarchy   | [observability.md](./observability.md)             | [observability-2.svg](./36-docs-diagrams-observability-2.svg)             | Request span tree                                                         |

The same source documents also embed Mermaid that is extracted by the render
script, so `01-…`–`15-…` additionally cover the reference architecture doc and
the authentication data-flow doc (system context, package graph, crypto
architecture, edge verification, refresh, ER model, security layers, deployment,
caching tiers, observability, and the register/login/refresh/authenticated-request
sequences — see [`docs/architecture/architecture.md`](../architecture/architecture.md)
and [`docs/architecture/data-flow.md`](../architecture/data-flow.md)).

## Rendering

````bash
# Render all diagrams (extracts every ```mermaid block from the source docs)
node scripts/render-diagrams.mjs
````

Prerequisites: `@mermaid-js/mermaid-cli` (or `mmdc`) on `PATH` and a
Chromium-based browser. The script's hard-coded `MMDC`, `PUPPETEER_CONFIG` and
`WORK` paths point at a local scratch install; adjust them for your environment.

> Note: this Mermaid version treats `;` in sequence-diagram message/note text as
> a statement terminator — use `-` or `·` inside messages instead of `;`.
