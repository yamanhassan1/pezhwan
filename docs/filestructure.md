pezhwan/
│
├── .github/ # GitHub configuration
│ ├── workflows/
│ │ ├── ci.yml # Full CI pipeline (build, test, lint, security)
│ │ ├── security.yml # Security scanning (Gitleaks, Trivy, Snyk)
│ │ ├── release.yml # Automated release workflow
│ │ ├── nightly.yml # Nightly integration tests
│ │ ├── dependency-review.yml # Dependabot PR review
│ │ ├── codeql.yml # CodeQL static analysis
│ │ └── compliance.yml # Compliance checks (GDPR, HIPAA)
│ ├── CODEOWNERS # Code ownership rules
│ ├── dependabot.yml # Dependabot configuration
│ ├── SECURITY.md # Security policy & disclosure
│ └── PULL_REQUEST_TEMPLATE.md # PR template
│
├── .husky/ # Git hooks
│ ├── pre-commit # Lint, format, secret scan
│ ├── pre-push # Run tests
│ └── commit-msg # Commit message validation
│
├── .vscode/ # VS Code workspace settings
│ ├── settings.json
│ ├── extensions.json
│ └── launch.json
│
├── docs/ # 📚 Documentation (comprehensive)
│ ├── README.md # Documentation index
│ │
│ ├── architecture/ # Architecture documentation
│ │ ├── README.md
│ │ ├── overview.md # High-level architecture
│ │ ├── data-flow.md # Authentication data flows
│ │ ├── deployment-patterns.md # Deployment patterns
│ │ ├── scaling.md # Horizontal scaling guide
│ │ ├── multi-tenancy.md # Multi-tenancy design
│ │ └── diagrams/ # Architecture diagrams
│ │ ├── system-overview.puml
│ │ ├── auth-flow.puml
│ │ └── deployment.puml
│ │
│ ├── security/ # Security documentation
│ │ ├── README.md
│ │ ├── THREAT-MODEL.md # STRIDE threat model
│ │ ├── security-audit.md # Audit record
│ │ ├── penetration-testing.md # Pentest methodology
│ │ ├── incident-response.md # Incident response plan
│ │ ├── security-checklist.md # Deployment checklist
│ │ ├── secrets-management.md # Secret management
│ │ ├── key-management.md # Key rotation guide
│ │ ├── zero-trust.md # Zero-trust architecture
│ │ │
│ │ └── compliance/ # Compliance documentation
│ │ ├── README.md
│ │ ├── gdpr.md # GDPR compliance
│ │ ├── hipaa.md # HIPAA compliance
│ │ ├── pci-dss.md # PCI DSS compliance
│ │ ├── soc2.md # SOC 2 compliance
│ │ ├── ccpa.md # CCPA compliance
│ │ ├── iso-27001.md # ISO 27001 compliance
│ │ └── fedramp.md # FedRAMP compliance
│ │
│ ├── operations/ # Operational documentation
│ │ ├── README.md
│ │ ├── PRODUCTION_READINESS.md # Production readiness
│ │ ├── deployment/ # Deployment guides
│ │ │ ├── README.md
│ │ │ ├── kubernetes.md # K8s deployment
│ │ │ ├── aws.md # AWS deployment
│ │ │ ├── azure.md # Azure deployment
│ │ │ ├── gcp.md # GCP deployment
│ │ │ ├── on-premise.md # On-premise deployment
│ │ │ └── docker.md # Docker deployment
│ │ ├── backup-restore.md # Backup & restore
│ │ ├── disaster-recovery.md # DR procedures
│ │ ├── monitoring.md # Monitoring guide
│ │ ├── alerts.md # Alert configuration
│ │ ├── logging.md # Logging strategy
│ │ ├── performance-tuning.md # Performance tuning
│ │ │
│ │ └── runbooks/ # Operational runbooks
│ │ ├── README.md
│ │ ├── key-rotation.md
│ │ ├── tenant-failover.md
│ │ ├── database-failover.md
│ │ ├── rate-limit-tuning.md
│ │ ├── incident-response.md
│ │ ├── security-breach.md
│ │ ├── zero-downtime-deployment.md
│ │ └── emergency-rollback.md
│ │
│ ├── developer/ # Developer documentation
│ │ ├── README.md
│ │ ├── GETTING-STARTED.md # Getting started guide
│ │ ├── CONTRIBUTING.md # Contribution guide
│ │ ├── local-development.md # Local dev setup
│ │ ├── testing.md # Testing guide
│ │ ├── debugging.md # Debugging guide
│ │ ├── plugin-development.md # Plugin development
│ │ ├── sdk-development.md # SDK development
│ │ ├── api-client.md # API client guide
│ │ └── best-practices.md # Best practices
│ │
│ ├── api/ # API documentation
│ │ ├── README.md
│ │ ├── OPENAPI.yaml # Full OpenAPI 3.0.3 spec
│ │ ├── graphql-schema.graphql # GraphQL schema
│ │ ├── webhooks.md # Webhook documentation
│ │ ├── rate-limits.md # Rate limit documentation
│ │ ├── errors.md # Error code reference
│ │ └── examples/ # API examples
│ │ ├── curl/
│ │ ├── javascript/
│ │ ├── python/
│ │ └── go/
│ │
│ ├── migration/ # Migration guides
│ │ ├── README.md
│ │ ├── auth0-migration.md
│ │ ├── firebase-migration.md
│ │ ├── keycloak-migration.md
│ │ ├── okta-migration.md
│ │ ├── cognito-migration.md
│ │ ├── supabase-migration.md
│ │ └── custom-migration.md
│ │
│ └── tutorials/ # Tutorials
│ ├── README.md
│ ├── simple-auth.md # Simple auth tutorial
│ ├── mfa-setup.md # MFA setup tutorial
│ ├── oauth-setup.md # OAuth setup tutorial
│ ├── social-login.md # Social login tutorial
│ ├── passkeys.md # Passkeys tutorial
│ ├── multi-tenant.md # Multi-tenant tutorial
│ └── enterprise-sso.md # Enterprise SSO tutorial
│
├── packages/ # 📦 Monorepo packages
│ │
│ ├── shared/ # Shared types & constants
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── index.ts
│ │ ├── types/
│ │ │ ├── auth.types.ts
│ │ │ ├── session.types.ts
│ │ │ ├── user.types.ts
│ │ │ ├── tenant.types.ts
│ │ │ ├── oauth.types.ts
│ │ │ ├── mfa.types.ts
│ │ │ ├── audit.types.ts
│ │ │ ├── webhook.types.ts
│ │ │ ├── plugin.types.ts
│ │ │ ├── sso.types.ts
│ │ │ ├── scim.types.ts
│ │ │ ├── saml.types.ts
│ │ │ ├── webauthn.types.ts
│ │ │ ├── risk.types.ts
│ │ │ ├── compliance.types.ts
│ │ │ └── events.types.ts
│ │ ├── constants/
│ │ │ ├── index.ts
│ │ │ ├── errors.ts
│ │ │ ├── policies.ts
│ │ │ ├── defaults.ts
│ │ │ └── audit-events.ts
│ │ ├── errors/
│ │ │ ├── index.ts
│ │ │ ├── PezhwanError.ts
│ │ │ ├── AuthenticationError.ts
│ │ │ ├── AuthorizationError.ts
│ │ │ ├── ValidationError.ts
│ │ │ ├── SessionError.ts
│ │ │ ├── SecurityError.ts
│ │ │ ├── ComplianceError.ts
│ │ │ └── RiskError.ts
│ │ ├── events/
│ │ │ ├── index.ts
│ │ │ ├── domain-events.ts
│ │ │ └── audit-events.ts
│ │ ├── utils/
│ │ │ ├── index.ts
│ │ │ ├── validators.ts
│ │ │ ├── helpers.ts
│ │ │ └── regex.ts
│ │ └── **tests**/
│ │ ├── types.test.ts
│ │ └── errors.test.ts
│ │
│ ├── crypto/ # 🔐 Cryptographic primitives
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── index.ts
│ │ ├── password.ts # Argon2id
│ │ ├── jwt.ts # JWT sign/verify
│ │ ├── keystore.ts # Key store
│ │ ├── otp.ts # OTP generation
│ │ ├── totp.ts # TOTP (RFC 6238)
│ │ ├── encryption.ts # AES-GCM envelope
│ │ ├── srp.ts # SRP-6a
│ │ ├── webauthn.ts # WebAuthn utilities
│ │ ├── random.ts # Secure random
│ │ ├── timing-safe.ts # Constant-time compare
│ │ │
│ │ ├── pq/ # Post-quantum crypto
│ │ │ ├── index.ts
│ │ │ ├── kyber.ts # CRYSTALS-Kyber
│ │ │ ├── dilithium.ts # CRYSTALS-Dilithium
│ │ │ ├── falcon.ts # Falcon
│ │ │ └── hybrid.ts # Hybrid mode
│ │ │
│ │ ├── zk/ # Zero-Knowledge Proofs
│ │ │ ├── index.ts
│ │ │ ├── snark.ts
│ │ │ ├── stark.ts
│ │ │ └── verifier.ts
│ │ │
│ │ ├── hsm/ # HSM integration
│ │ │ ├── index.ts
│ │ │ ├── pkcs11.ts
│ │ │ ├── aws-kms.ts
│ │ │ ├── azure-keyvault.ts
│ │ │ └── gcp-kms.ts
│ │ │
│ │ └── **tests**/
│ │ ├── password.test.ts
│ │ ├── jwt.test.ts
│ │ ├── keystore.test.ts
│ │ ├── totp.test.ts
│ │ └── encryption.test.ts
│ │
│ ├── oauth/ # 🔑 OAuth 2.1 / OIDC
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── index.ts
│ │ ├── oauth.service.ts # OAuth 2.1 engine
│ │ ├── oidc.service.ts # OIDC discovery
│ │ ├── pkce.ts # PKCE S256
│ │ ├── authorization-code.ts # Code management
│ │ ├── token-exchange.ts # Token exchange
│ │ │
│ │ ├── providers/ # Social login
│ │ │ ├── index.ts
│ │ │ ├── base.provider.ts
│ │ │ ├── google.provider.ts
│ │ │ ├── github.provider.ts
│ │ │ ├── microsoft.provider.ts
│ │ │ ├── apple.provider.ts
│ │ │ ├── facebook.provider.ts
│ │ │ └── custom.provider.ts
│ │ │
│ │ ├── federation/ # Federation
│ │ │ ├── index.ts
│ │ │ ├── saml.service.ts
│ │ │ ├── oidc-federation.ts
│ │ │ └── oauth-federation.ts
│ │ │
│ │ ├── scim/ # SCIM 2.0
│ │ │ ├── index.ts
│ │ │ ├── users.ts
│ │ │ ├── groups.ts
│ │ │ ├── schemas.ts
│ │ │ └── service-provider.ts
│ │ │
│ │ └── **tests**/
│ │ ├── oauth.test.ts
│ │ ├── pkce.test.ts
│ │ └── providers.test.ts
│ │
│ ├── core/ # ⚙️ Core engine
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── index.ts
│ │ ├── pezhwan.ts # Main entry point
│ │ ├── config/
│ │ │ ├── index.ts
│ │ │ ├── env.ts
│ │ │ └── validation.ts
│ │ │
│ │ ├── models/ # Mongoose models
│ │ │ ├── index.ts
│ │ │ ├── user.model.ts
│ │ │ ├── session.model.ts
│ │ │ ├── tenant.model.ts
│ │ │ ├── application.model.ts
│ │ │ ├── role.model.ts
│ │ │ ├── permission.model.ts
│ │ │ ├── otp.model.ts
│ │ │ ├── audit-log.model.ts
│ │ │ ├── audit-sequence.model.ts
│ │ │ ├── api-key.model.ts
│ │ │ ├── oauth-client.model.ts
│ │ │ ├── oauth-code.model.ts
│ │ │ ├── backup-code.model.ts
│ │ │ ├── verification-token.model.ts
│ │ │ ├── webhook.model.ts
│ │ │ ├── webhook-delivery.model.ts
│ │ │ ├── trusted-device.model.ts
│ │ │ ├── team.model.ts
│ │ │ ├── organization.model.ts
│ │ │ ├── subscription.model.ts
│ │ │ ├── tenant-quota.model.ts
│ │ │ ├── decoy-user.model.ts
│ │ │ ├── webauthn-credential.model.ts
│ │ │ ├── risk-event.model.ts
│ │ │ ├── breach-record.model.ts
│ │ │ └── data-export.model.ts
│ │ │
│ │ ├── services/ # Business services
│ │ │ ├── index.ts
│ │ │ │
│ │ │ ├── auth/ # Authentication
│ │ │ │ ├── index.ts
│ │ │ │ ├── auth.engine.ts
│ │ │ │ ├── password.service.ts
│ │ │ │ ├── otp.service.ts
│ │ │ │ ├── mfa.service.ts
│ │ │ │ ├── verification-token.service.ts
│ │ │ │ ├── webauthn.service.ts
│ │ │ │ ├── srp.service.ts
│ │ │ │ ├── passwordless.service.ts
│ │ │ │ ├── magic-link.service.ts
│ │ │ │ └── progressive-profile.service.ts
│ │ │ │
│ │ │ ├── session/ # Session management
│ │ │ │ ├── index.ts
│ │ │ │ ├── session.service.ts
│ │ │ │ ├── device.service.ts
│ │ │ │ └── trust.service.ts
│ │ │ │
│ │ │ ├── authorization/ # Authorization
│ │ │ │ ├── index.ts
│ │ │ │ ├── authorization.service.ts
│ │ │ │ ├── abac.service.ts
│ │ │ │ ├── policy-engine.ts
│ │ │ │ └── permission.service.ts
│ │ │ │
│ │ │ ├── tenant/ # Multi-tenancy
│ │ │ │ ├── index.ts
│ │ │ │ ├── tenant.service.ts
│ │ │ │ ├── organization.service.ts
│ │ │ │ ├── team.service.ts
│ │ │ │ └── quota.service.ts
│ │ │ │
│ │ │ ├── oauth/ # OAuth services
│ │ │ │ ├── index.ts
│ │ │ │ ├── oauth.service.ts
│ │ │ │ ├── oidc.service.ts
│ │ │ │ ├── client.service.ts
│ │ │ │ └── federated.service.ts
│ │ │ │
│ │ │ ├── audit/ # Audit & logging
│ │ │ │ ├── index.ts
│ │ │ │ ├── audit.service.ts
│ │ │ │ ├── audit-writer.ts
│ │ │ │ └── retention.service.ts
│ │ │ │
│ │ │ ├── observability/ # Observability
│ │ │ │ ├── index.ts
│ │ │ │ ├── logger.service.ts
│ │ │ │ ├── metrics.service.ts
│ │ │ │ ├── tracing.service.ts
│ │ │ │ └── health.service.ts
│ │ │ │
│ │ │ ├── security/ # Security services
│ │ │ │ ├── index.ts
│ │ │ │ ├── rate-limit.service.ts
│ │ │ │ ├── account-state.service.ts
│ │ │ │ ├── risk.service.ts
│ │ │ │ ├── breach-detector.service.ts
│ │ │ │ ├── bot-detector.service.ts
│ │ │ │ ├── decoy.service.ts
│ │ │ │ ├── captcha.service.ts
│ │ │ │ └── hibp.service.ts
│ │ │ │
│ │ │ ├── infrastructure/ # Infrastructure
│ │ │ │ ├── index.ts
│ │ │ │ ├── redis-cache.ts
│ │ │ │ ├── redis-manager.ts
│ │ │ │ ├── key-store.service.ts
│ │ │ │ ├── distributed-lock.ts
│ │ │ │ ├── connection-pool.ts
│ │ │ │ └── query-optimizer.ts
│ │ │ │
│ │ │ ├── events/ # Event system
│ │ │ │ ├── index.ts
│ │ │ │ ├── event-bus.ts
│ │ │ │ ├── webhook.service.ts
│ │ │ │ ├── job-queue.ts
│ │ │ │ │
│ │ │ │ └── event-sourcing/
│ │ │ │ ├── index.ts
│ │ │ │ ├── event-store.ts
│ │ │ │ ├── projector.ts
│ │ │ │ └── replay.service.ts
│ │ │ │
│ │ │ ├── ecosystem/ # Ecosystem
│ │ │ │ ├── index.ts
│ │ │ │ ├── api-key.service.ts
│ │ │ │ ├── subscription.service.ts
│ │ │ │ ├── billing.service.ts
│ │ │ │ └── usage.service.ts
│ │ │ │
│ │ │ ├── compliance/ # Compliance
│ │ │ │ ├── index.ts
│ │ │ │ ├── gdpr.service.ts
│ │ │ │ ├── hipaa.service.ts
│ │ │ │ ├── pci.service.ts
│ │ │ │ ├── soc2.service.ts
│ │ │ │ └── ccpa.service.ts
│ │ │ │
│ │ │ └── developer/ # Developer services
│ │ │ ├── index.ts
│ │ │ ├── api-usage.service.ts
│ │ │ ├── developer-portal.service.ts
│ │ │ └── plugin-manager.service.ts
│ │ │
│ │ ├── middleware/ # Express middleware
│ │ │ ├── index.ts
│ │ │ ├── auth.middleware.ts
│ │ │ ├── tenant.middleware.ts
│ │ │ ├── rate-limit.middleware.ts
│ │ │ ├── csrf.middleware.ts
│ │ │ ├── cors.middleware.ts
│ │ │ ├── security-headers.ts
│ │ │ ├── request-context.ts
│ │ │ ├── risk.middleware.ts
│ │ │ ├── bot.middleware.ts
│ │ │ ├── mfa.middleware.ts
│ │ │ ├── compliance.middleware.ts
│ │ │ └── trust-device.middleware.ts
│ │ │
│ │ ├── adapters/ # External adapters
│ │ │ ├── index.ts
│ │ │ │
│ │ │ ├── email/ # Email providers
│ │ │ │ ├── index.ts
│ │ │ │ ├── nodemailer.ts
│ │ │ │ ├── sendgrid.ts
│ │ │ │ ├── aws-ses.ts
│ │ │ │ ├── mailgun.ts
│ │ │ │ └── mock.ts
│ │ │ │
│ │ │ ├── sms/ # SMS providers
│ │ │ │ ├── index.ts
│ │ │ │ ├── twilio.ts
│ │ │ │ ├── aws-sns.ts
│ │ │ │ ├── vonage.ts
│ │ │ │ └── mock.ts
│ │ │ │
│ │ │ ├── payment/ # Payment providers
│ │ │ │ ├── index.ts
│ │ │ │ ├── stripe.ts
│ │ │ │ ├── paddle.ts
│ │ │ │ └── chargebee.ts
│ │ │ │
│ │ │ └── storage/ # Storage providers
│ │ │ ├── index.ts
│ │ │ ├── s3.ts
│ │ │ ├── azure-blob.ts
│ │ │ └── gcs.ts
│ │ │
│ │ ├── plugins/ # Plugin system
│ │ │ ├── index.ts
│ │ │ ├── plugin-loader.ts
│ │ │ ├── plugin-manager.ts
│ │ │ └── hooks.ts
│ │ │
│ │ └── **tests**/
│ │ ├── unit/ # Unit tests
│ │ │ ├── services/
│ │ │ ├── models/
│ │ │ └── middleware/
│ │ ├── integration/ # Integration tests
│ │ │ ├── auth.test.ts
│ │ │ ├── session.test.ts
│ │ │ ├── mfa.test.ts
│ │ │ ├── oauth.test.ts
│ │ │ └── tenant.test.ts
│ │ └── fixtures/
│ │ ├── users.ts
│ │ ├── tenants.ts
│ │ └── oauth-clients.ts
│ │
│ ├── node/ # 🟢 Node.js SDK
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── index.ts
│ │ ├── client.ts
│ │ ├── auth.ts
│ │ ├── session.ts
│ │ ├── mfa.ts
│ │ ├── authorization.ts
│ │ ├── errors.ts
│ │ └── **tests**/
│ │ └── client.test.ts
│ │
│ ├── express/ # 🚀 Express integration
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── index.ts
│ │ ├── middleware.ts
│ │ ├── security.ts
│ │ ├── rate-limit.ts
│ │ │
│ │ ├── routes/ # Express routes
│ │ │ ├── index.ts
│ │ │ ├── auth.routes.ts
│ │ │ ├── session.routes.ts
│ │ │ ├── mfa.routes.ts
│ │ │ ├── oauth.routes.ts
│ │ │ ├── verification.routes.ts
│ │ │ ├── admin.routes.ts
│ │ │ ├── webhook.routes.ts
│ │ │ ├── team.routes.ts
│ │ │ ├── subscription.routes.ts
│ │ │ ├── compliance.routes.ts
│ │ │ ├── graphql.routes.ts
│ │ │ ├── scim.routes.ts
│ │ │ └── developer.routes.ts
│ │ │
│ │ ├── websocket/ # WebSocket support
│ │ │ ├── index.ts
│ │ │ ├── server.ts
│ │ │ ├── events.ts
│ │ │ └── auth.ts
│ │ │
│ │ └── **tests**/
│ │ ├── middleware.test.ts
│ │ └── routes.test.ts
│ │
│ ├── react/ # ⚛️ React SDK
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── index.ts
│ │ ├── provider.tsx
│ │ ├── context.tsx
│ │ │
│ │ ├── hooks/ # React hooks
│ │ │ ├── index.ts
│ │ │ ├── useAuth.ts
│ │ │ ├── useSession.ts
│ │ │ ├── useAuthorization.ts
│ │ │ ├── useMFA.ts
│ │ │ ├── useWebAuthn.ts
│ │ │ ├── useSSO.ts
│ │ │ ├── usePasswordless.ts
│ │ │ └── useTenant.ts
│ │ │
│ │ ├── components/ # React components
│ │ │ ├── index.ts
│ │ │ ├── AuthProvider.tsx
│ │ │ ├── LoginForm.tsx
│ │ │ ├── RegisterForm.tsx
│ │ │ ├── MFASetup.tsx
│ │ │ ├── MFALogin.tsx
│ │ │ ├── PasswordlessLogin.tsx
│ │ │ ├── WebAuthnLogin.tsx
│ │ │ ├── SSOLogin.tsx
│ │ │ ├── Profile.tsx
│ │ │ ├── SessionManager.tsx
│ │ │ ├── ProtectedRoute.tsx
│ │ │ ├── RequireRole.tsx
│ │ │ ├── RequirePermission.tsx
│ │ │ ├── TrustedDevices.tsx
│ │ │ └── DataExport.tsx
│ │ │
│ │ └── **tests**/
│ │ ├── hooks.test.ts
│ │ └── components.test.tsx
│ │
│ ├── angular/ # 🅰️ Angular SDK [NEW]
│ │ ├── package.json
│ │ ├── ng-package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── public-api.ts
│ │ ├── lib/
│ │ │ ├── pezhwan.module.ts
│ │ │ ├── auth/
│ │ │ │ ├── auth.service.ts
│ │ │ │ ├── auth.guard.ts
│ │ │ │ └── auth.interceptor.ts
│ │ │ ├── session/
│ │ │ │ └── session.service.ts
│ │ │ ├── components/
│ │ │ └── models/
│ │ └── **tests**/
│ │
│ ├── vue/ # 🟩 Vue SDK [NEW]
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── README.md
│ │ └── src/
│ │ ├── index.ts
│ │ ├── plugin.ts
│ │ ├── composables/
│ │ │ ├── useAuth.ts
│ │ │ ├── useSession.ts
│ │ │ └── useMFA.ts
│ │ └── components/
│ │ ├── LoginForm.vue
│ │ ├── RegisterForm.vue
│ │ └── ProtectedRoute.vue
│ │
│ ├── python/ # 🐍 Python SDK [NEW]
│ │ ├── setup.py
│ │ ├── pyproject.toml
│ │ ├── README.md
│ │ ├── requirements.txt
│ │ └── pezhwan/
│ │ ├── **init**.py
│ │ ├── client.py
│ │ ├── auth.py
│ │ ├── session.py
│ │ ├── mfa.py
│ │ ├── models.py
│ │ └── errors.py
│ │
│ ├── go/ # 🐹 Go SDK [NEW]
│ │ ├── go.mod
│ │ ├── go.sum
│ │ ├── README.md
│ │ └── pezhwan/
│ │ ├── client.go
│ │ ├── auth.go
│ │ ├── session.go
│ │ ├── mfa.go
│ │ ├── models.go
│ │ └── errors.go
│ │
│ ├── java/ # ☕ Java SDK [NEW]
│ │ ├── pom.xml
│ │ ├── README.md
│ │ └── src/
│ │ └── main/
│ │ └── java/
│ │ └── com/
│ │ └── pezhwan/
│ │ ├── PezhwanClient.java
│ │ ├── AuthService.java
│ │ ├── SessionService.java
│ │ ├── MFAService.java
│ │ ├── models/
│ │ └── exceptions/
│ │
│ ├── dotnet/ # 🔷 .NET SDK [NEW]
│ │ ├── Pezhwan.csproj
│ │ ├── README.md
│ │ └── Pezhwan/
│ │ ├── PezhwanClient.cs
│ │ ├── AuthService.cs
│ │ ├── SessionService.cs
│ │ ├── MFAService.cs
│ │ ├── Models/
│ │ └── Exceptions/
│ │
│ └── cli/ # 🖥️ CLI Tool [NEW]
│ ├── package.json
│ ├── tsconfig.json
│ ├── README.md
│ └── src/
│ │ ├── index.ts
│ │ ├── commands/
│ │ │ ├── auth.ts
│ │ │ ├── users.ts
│ │ │ ├── tenants.ts
│ │ │ ├── sessions.ts
│ │ │ ├── roles.ts
│ │ │ ├── clients.ts
│ │ │ ├── audit.ts
│ │ │ ├── keys.ts
│ │ │ ├── backup.ts
│ │ │ ├── health.ts
│ │ │ ├── config.ts
│ │ │ └── migrate.ts
│ │ ├── utils/
│ │ │ ├── logger.ts
│ │ │ ├── config.ts
│ │ │ └── format.ts
│ │ └── **tests**/
│ └── bin/
│ └── pezhwan
│
├── apps/ # 📱 Applications
│ │
│ ├── identity-server/ # 🏛️ Reference server
│ │ ├── package.json
│ │ ├── tsconfig.json
│ │ ├── Dockerfile
│ │ ├── .dockerignore
│ │ ├── README.md
│ │ ├── keys/ # Signing keys
│ │ │ └── .gitkeep
│ │ ├── src/
│ │ │ ├── server.ts
│ │ │ ├── app.ts
│ │ │ └── config/
│ │ │ ├── env.ts
│ │ │ └── index.ts
│ │ ├── demo/ # Browser demo
│ │ │ ├── index.html
│ │ │ ├── styles.css
│ │ │ └── app.js
│ │ └── **tests**/
│ │ └── server.test.ts
│ │
│ ├── admin-console/ # 🎛️ Admin UI [NEW]
│ │ ├── package.json
│ │ ├── vite.config.ts
│ │ ├── index.html
│ │ ├── Dockerfile
│ │ ├── README.md
│ │ └── src/
│ │ ├── main.tsx
│ │ ├── App.tsx
│ │ ├── routes/
│ │ │ ├── index.ts
│ │ │ ├── Dashboard.tsx
│ │ │ ├── Users/
│ │ │ │ ├── List.tsx
│ │ │ │ ├── Create.tsx
│ │ │ │ ├── Edit.tsx
│ │ │ │ └── Details.tsx
│ │ │ ├── Sessions/
│ │ │ │ └── List.tsx
│ │ │ ├── Audit/
│ │ │ │ └── Logs.tsx
│ │ │ ├── Clients/
│ │ │ │ ├── List.tsx
│ │ │ │ └── Create.tsx
│ │ │ ├── Tenants/
│ │ │ │ ├── List.tsx
│ │ │ │ └── Create.tsx
│ │ │ ├── Roles/
│ │ │ │ └── List.tsx
│ │ │ ├── Subscriptions/
│ │ │ │ └── List.tsx
│ │ │ ├── Settings/
│ │ │ │ └── index.tsx
│ │ │ └── Security/
│ │ │ ├── Breaches.tsx
│ │ │ └── Risk.tsx
│ │ ├── components/
│ │ │ ├── Layout/
│ │ │ │ ├── Layout.tsx
│ │ │ │ ├── Sidebar.tsx
│ │ │ │ ├── Header.tsx
│ │ │ │ └── Footer.tsx
│ │ │ ├── DataTable/
│ │ │ │ └── DataTable.tsx
│ │ │ ├── Forms/
│ │ │ │ ├── UserForm.tsx
│ │ │ │ ├── ClientForm.tsx
│ │ │ │ └── TenantForm.tsx
│ │ │ └── Charts/
│ │ │ ├── UsageChart.tsx
│ │ │ └── AuditChart.tsx
│ │ ├── hooks/
│ │ │ ├── useAuth.ts
│ │ │ └── useApi.ts
│ │ ├── lib/
│ │ │ ├── api.ts
│ │ │ └── utils.ts
│ │ └── types/
│ │ └── index.ts
│ │
│ └── developer-portal/ # 👨‍💻 Developer Portal [NEW]
│ ├── package.json
│ ├── vite.config.ts
│ ├── index.html
│ ├── Dockerfile
│ ├── README.md
│ └── src/
│ ├── main.tsx
│ ├── App.tsx
│ ├── routes/
│ │ ├── Dashboard.tsx
│ │ ├── ApiKeys/
│ │ │ ├── List.tsx
│ │ │ └── Create.tsx
│ │ ├── Webhooks/
│ │ │ ├── List.tsx
│ │ │ └── Create.tsx
│ │ ├── Analytics/
│ │ │ └── index.tsx
│ │ ├── Docs/
│ │ │ └── index.tsx
│ │ └── Profile/
│ │ └── index.tsx
│ ├── components/
│ │ ├── Layout.tsx
│ │ ├── ApiExplorer.tsx
│ │ ├── KeyManager.tsx
│ │ └── WebhookTester.tsx
│ └── hooks/
│ └── useApi.ts
│
├── infrastructure/ # 🏗️ Infrastructure
│ │
│ ├── docker/ # Docker configuration
│ │ ├── README.md
│ │ ├── docker-compose.yml # Full compose (prod)
│ │ ├── docker-compose.dev.yml # Development compose
│ │ ├── docker-compose.test.yml # Test compose
│ │ ├── docker-compose.prod.yml # Production compose
│ │ │
│ │ ├── mongo/ # MongoDB
│ │ │ ├── Dockerfile
│ │ │ ├── init.js # Replica set init
│ │ │ ├── seed.js # Seed data
│ │ │ ├── mongod.conf
│ │ │ └── scripts/
│ │ │ ├── backup.sh
│ │ │ └── restore.sh
│ │ │
│ │ ├── redis/ # Redis
│ │ │ ├── Dockerfile
│ │ │ ├── redis.conf
│ │ │ └── sentinel.conf
│ │ │
│ │ ├── nginx/ # Nginx reverse proxy
│ │ │ ├── Dockerfile
│ │ │ ├── nginx.conf
│ │ │ └── ssl/
│ │ │ └── .gitkeep
│ │ │
│ │ └── monitoring/ # Monitoring stack
│ │ ├── prometheus/
│ │ │ ├── Dockerfile
│ │ │ ├── prometheus.yml
│ │ │ └── alerts.yml
│ │ ├── grafana/
│ │ │ ├── Dockerfile
│ │ │ ├── datasources.yml
│ │ │ └── dashboards/
│ │ │ └── pezhwan.json
│ │ └── loki/
│ │ ├── Dockerfile
│ │ └── loki-config.yml
│ │
│ ├── kubernetes/ # Kubernetes manifests
│ │ ├── README.md
│ │ │
│ │ ├── helm/ # Helm chart
│ │ │ └── pezhwan/
│ │ │ ├── Chart.yaml
│ │ │ ├── values.yaml
│ │ │ ├── values-dev.yaml
│ │ │ ├── values-staging.yaml
│ │ │ ├── values-prod.yaml
│ │ │ └── templates/
│ │ │ ├── _helpers.tpl
│ │ │ ├── deployment.yaml
│ │ │ ├── service.yaml
│ │ │ ├── ingress.yaml
│ │ │ ├── secrets.yaml
│ │ │ ├── configmap.yaml
│ │ │ ├── mongodb.yaml
│ │ │ ├── redis.yaml
│ │ │ ├── pvc.yaml
│ │ │ ├── hpa.yaml
│ │ │ ├── pdb.yaml
│ │ │ ├── network-policy.yaml
│ │ │ ├── servicemonitor.yaml
│ │ │ └── tests/
│ │ │ └── test-connection.yaml
│ │ │
│ │ └── manifests/ # Raw K8s manifests
│ │ ├── namespace.yaml
│ │ ├── deployment.yaml
│ │ ├── service.yaml
│ │ ├── ingress.yaml
│ │ ├── configmap.yaml
│ │ ├── secret.yaml
│ │ ├── pvc.yaml
│ │ ├── hpa.yaml
│ │ └── network-policy.yaml
│ │
│ ├── terraform/ # Terraform infrastructure
│ │ ├── README.md
│ │ ├── main.tf
│ │ ├── variables.tf
│ │ ├── outputs.tf
│ │ ├── providers.tf
│ │ │
│ │ ├── modules/
│ │ │ ├── aws/
│ │ │ │ ├── main.tf
│ │ │ │ ├── variables.tf
│ │ │ │ ├── outputs.tf
│ │ │ │ ├── ecs.tf
│ │ │ │ ├── rds.tf
│ │ │ │ ├── elasticache.tf
│ │ │ │ ├── alb.tf
│ │ │ │ ├── vpc.tf
│ │ │ │ └── security-groups.tf
│ │ │ ├── azure/
│ │ │ │ ├── main.tf
│ │ │ │ ├── variables.tf
│ │ │ │ └── outputs.tf
│ │ │ └── gcp/
│ │ │ ├── main.tf
│ │ │ ├── variables.tf
│ │ │ └── outputs.tf
│ │ │
│ │ └── provider/ # Terraform provider
│ │ ├── provider.go
│ │ ├── resource_user.go
│ │ ├── resource_tenant.go
│ │ ├── resource_role.go
│ │ ├── resource_client.go
│ │ ├── resource_webhook.go
│ │ ├── data_source_user.go
│ │ ├── data_source_tenant.go
│ │ └── go.mod
│ │
│ └── scripts/ # Infrastructure scripts
│ ├── backup.sh
│ ├── restore.sh
│ ├── migrate.sh
│ ├── seed.sh
│ ├── health-check.sh
│ ├── rotate-keys.sh
│ └── generate-secret.sh
│
├── templates/ # 📋 Application templates
│ ├── README.md
│ │
│ ├── nextjs/ # Next.js template
│ │ ├── package.json
│ │ ├── next.config.js
│ │ ├── tsconfig.json
│ │ └── src/
│ │ ├── app/
│ │ │ ├── layout.tsx
│ │ │ ├── page.tsx
│ │ │ ├── login/
│ │ │ │ └── page.tsx
│ │ │ ├── dashboard/
│ │ │ │ └── page.tsx
│ │ │ ├── profile/
│ │ │ │ └── page.tsx
│ │ │ └── api/
│ │ │ └── auth/
│ │ │ └── [...nextauth]/
│ │ │ └── route.ts
│ │ ├── components/
│ │ │ ├── AuthProvider.tsx
│ │ │ ├── ProtectedRoute.tsx
│ │ │ └── Navbar.tsx
│ │ └── lib/
│ │ └── pezhwan.ts
│ │
│ ├── react-spa/ # React SPA template
│ │ ├── package.json
│ │ ├── vite.config.ts
│ │ ├── index.html
│ │ └── src/
│ │ ├── main.tsx
│ │ ├── App.tsx
│ │ ├── routes/
│ │ ├── components/
│ │ └── hooks/
│ │
│ ├── vue/ # Vue template
│ │ ├── package.json
│ │ ├── vite.config.ts
│ │ ├── index.html
│ │ └── src/
│ │ ├── main.ts
│ │ ├── App.vue
│ │ ├── plugins/
│ │ │ └── pezhwan.ts
│ │ ├── views/
│ │ └── components/
│ │
│ ├── angular/ # Angular template
│ │ ├── angular.json
│ │ ├── package.json
│ │ └── src/
│ │ └── app/
│ │ ├── auth/
│ │ │ ├── auth.service.ts
│ │ │ └── auth.guard.ts
│ │ ├── shared/
│ │ │ └── pezhwan/
│ │ │ └── pezhwan.module.ts
│ │ └── app.module.ts
│ │
│ └── express-api/ # Express API template
│ ├── package.json
│ ├── tsconfig.json
│ ├── server.ts
│ ├── routes/
│ │ └── auth.ts
│ ├── middleware/
│ │ └── auth.ts
│ └── models/
│ └── user.ts
│
├── demos/ # 🎯 Demo applications
│ ├── README.md
│ │
│ ├── basic-auth/ # Basic auth demo
│ │ ├── package.json
│ │ ├── server.ts
│ │ └── index.html
│ │
│ ├── mfa-demo/ # MFA demo
│ │ ├── package.json
│ │ ├── server.ts
│ │ └── index.html
│ │
│ ├── oauth-demo/ # OAuth demo
│ │ ├── package.json
│ │ ├── server.ts
│ │ └── index.html
│ │
│ ├── social-login/ # Social login demo
│ │ ├── package.json
│ │ ├── server.ts
│ │ └── index.html
│ │
│ ├── passkeys/ # Passkeys demo
│ │ ├── package.json
│ │ ├── server.ts
│ │ └── index.html
│ │
│ ├── multi-tenant/ # Multi-tenant demo
│ │ ├── package.json
│ │ ├── server.ts
│ │ └── index.html
│ │
│ ├── machine-to-machine/ # M2M auth demo
│ │ ├── package.json
│ │ ├── server.ts
│ │ └── index.html
│ │
│ └── passwordless/ # Passwordless demo
│ ├── package.json
│ ├── server.ts
│ └── index.html
│
├── migrations/ # 🔄 Database migrations
│ ├── README.md
│ ├── migration-runner.ts
│ ├── 001-initial-schema.ts
│ ├── 002-add-mfa-fields.ts
│ ├── 003-add-audit-sequence.ts
│ ├── 004-mfa-secrets-encryption.ts
│ ├── 005-add-tenants-applications.ts
│ ├── 006-add-webhooks.ts
│ ├── 007-add-teams-organizations.ts
│ ├── 008-add-subscriptions.ts
│ ├── 009-add-webauthn.ts
│ ├── 010-add-risk-events.ts
│ └── rollback/
│ └── 004-mfa-secrets-rollback.ts
│
├── scripts/ # 📜 Development scripts
│ ├── generate-secret.mjs
│ ├── secret-scan.mjs
│ ├── backup-drill.mjs
│ ├── restore-drill.mjs
│ ├── migrate-mfa.mjs
│ ├── rotate-keys.mjs
│ ├── seed-database.mjs
│ ├── health-check.mjs
│ ├── benchmark.mjs
│ ├── security-audit.mjs
│ ├── release.mjs
│ ├── dependency-audit.mjs
│ └── setup-hooks.mjs
│
├── tests/ # 🧪 Test suites
│ ├── README.md
│ │
│ ├── unit/ # Unit tests
│ │ ├── auth.test.ts
│ │ ├── session.test.ts
│ │ ├── mfa.test.ts
│ │ └── crypto.test.ts
│ │
│ ├── integration/ # Integration tests
│ │ ├── auth-flow.test.ts
│ │ ├── session-rotation.test.ts
│ │ ├── mfa-lockout.test.ts
│ │ ├── oauth-flow.test.ts
│ │ ├── tenant-isolation.test.ts
│ │ └── rate-limits.test.ts
│ │
│ ├── load/ # Load tests
│ │ ├── auth.load.js
│ │ ├── mfa.load.js
│ │ └── oauth.load.js
│ │
│ ├── security/ # Security tests
│ │ ├── backstop-security.test.ts
│ │ ├── token-attacks.test.ts
│ │ ├── csrf.test.ts
│ │ ├── cors.test.ts
│ │ ├── rate-limit-attack.test.ts
│ │ └── injection.test.ts
│ │
│ ├── failure/ # Failure injection tests
│ │ ├── redis-failure.test.ts
│ │ ├── mongo-failure.test.ts
│ │ ├── key-corruption.test.ts
│ │ └── provider-failure.test.ts
│ │
│ └── interop/ # Interoperability tests
│ ├── google-oauth.test.ts
│ ├── github-oauth.test.ts
│ ├── microsoft-oauth.test.ts
│ └── saml.test.ts
│
├── docs/ # 📚 Documentation (moved to root)
├── .env.example # Environment template
├── .env # Local environment (gitignored)
├── .gitignore # Git ignore
├── .dockerignore # Docker ignore
├── .editorconfig # Editor config
├── .prettierrc # Prettier config
├── .prettierignore # Prettier ignore
├── .eslintrc.json # ESLint config
├── .eslintignore # ESLint ignore
├── .commitlintrc.json # Commitlint config
├── package.json # Root package.json
├── package-lock.json # Lockfile
├── tsconfig.base.json # Base TypeScript config
├── tsconfig.json # Root TypeScript config
├── jest.config.js # Jest config
├── jest.integration.config.js # Integration test config
├── vitest.config.ts # Vitest config
├── nodemon.json # Nodemon config
├── renovate.json # Renovate config
│
├── README.md # 📖 Root README
├── CONTRIBUTING.md # Contribution guide
├── LICENSE # License
├── CHANGELOG.md # Changelog
├── SECURITY.md # Security policy
├── CODE_OF_CONDUCT.md # Code of conduct
├── SUPPORT.md # Support policy
│
├── PROBLEMS.md # Known problems (existing)
├── PRODUCTION_READINESS.md # Production readiness (existing)
│
└── node_modules/ # 🔧 Dependencies (gitignored)

Package Dependency Graph

┌─────────────────────────────────────────────────────────────────────────────┐
│ APPLICATIONS │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│ │ identity- │ │ admin- │ │ developer- │ │ nextjs/react/ │ │
│ │ server │ │ console │ │ portal │ │ vue/angular │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SDK LAYER │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ react │ │ angular │ │ vue │ │ node │ │ express │ │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
│ │ python │ │ go │ │ java │ │ dotnet │ │ cli │ │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ CORE LAYER │
│ ┌─────────────────────────────────────────────────────────────────────────┐│
│ │ core ││
│ │ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────────────┐ ││
│ │ │ services │ │ models │ │ middleware/adapters │ ││
│ │ │ (50+) │ │ (25+) │ │ │ ││
│ │ └─────────────┘ └─────────────┘ └─────────────────────────────────┘ ││
│ └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
│
▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SUPPORT LAYER │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐│
│ │ oauth │ │ crypto │ │ shared │ │ infrastructure││
│ │ (OAuth2.1) │ │ (crypto/HSM)│ │ (types/err) │ │ (docker/k8s/tf) ││
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
