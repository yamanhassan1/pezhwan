# Security and production operations

These documents define the controls and operational evidence required before a
Pezhwan deployment is approved for production. Each control is implemented in
code where possible and must also be verified in the deployment environment.

- [Key management](./key-management.md)
- [Authentication security](./authentication.md)
- [Authorization security](./authorization.md)
- [Session security](./sessions.md)
- [OAuth security](./oauth.md)
- [Multi-tenancy security](./multi-tenancy.md)
- [Rate limiting](./rate-limiting.md)
- [Incident response](./incident-response.md)
- [Disaster recovery](./disaster-recovery.md)
- [Production hardening](./production-hardening.md)
- [Secret management](./secrets-management.md)

The release owner records command output, timestamps, environment, and the
reviewer for every pre-release verification. A passing unit test alone is not
evidence that MongoDB, Redis, TLS, backups, or external identity providers are
ready.
