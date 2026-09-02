# PEZHWAN — Secret & Configuration Management

This document defines what is sensitive, what may be committed, how to manage
secrets in development and production, how to rotate them, and how to respond
if a secret is leaked. **Read it before contributing.**

---

## 1. What is considered sensitive?

Any value that, if disclosed, would let an attacker impersonate a user, read
protected data, or pivot into a trusted system. This includes, but is not
limited to:

- **JWT signing private keys** and RSA/EC/Ed25519 private keys
- **JWT secrets**, refresh-token secrets, session secrets, cookie secrets
- **CSRF / encryption / hashing (pepper) secrets**
- **MongoDB / Redis / any database connection strings containing credentials**
- **Database usernames & passwords**
- **OAuth client secrets** (Google, GitHub, Apple, Microsoft, etc.)
- **API keys** and third-party service tokens
- **SMTP username/password** and email-provider API keys
- **SMS/OTP provider credentials**
- **Payment provider secrets** and webhook signing secrets
- **Cloud provider credentials** (AWS, GCP, Azure, Firebase service accounts)
- Any `.pem`, `.key`, `.crt`, service-account JSON, credential JSON
- Admin bootstrap credentials and internal service authentication tokens
- OTP codes, session IDs, refresh tokens (at runtime)

## 2. What may be committed?

- Source code (TypeScript, config for the app itself)
- `.env.example` — placeholders **only**, never real values
- Documentation
- Public JWKS (public keys are safe to share)
- Test **fixtures** that use clearly dummy values (e.g. `hunter2`)
  constructed solely to verify that the logger redacts them
- Public OAuth client IDs (but never client secrets)

## 3. What must NEVER be committed?

- `.env`, `.env.local`, `.env.development`, `.env.test`, `.env.production`
- Any real secret, token, private key, password, or credential
- `credentials.json`, `service-account.json`, `*-service-account.json`
- `*.pem`, `*.key`, `*.crt`, `*.p12`, `*.pfx`, `*.keystore`
- Anything under `secrets/`, `private/`, `keys/`
- Secrets in README, docs, examples, screenshots, or the frontend bundle

The `.gitignore` is configured to block these. **But `.gitignore` only stops
new commits — it does not remove a file already in history.**

## 4. Local development setup

```bash
# 1. Install dependencies
npm install

# 2. Install git hooks (secret scanning on commit)
npm run setup

# 3. Create your local env from the template
cp .env.example .env

# 4. Fill in required values (the config fails fast if they are missing)

# 5. Generate local secrets with the bundled helper
node scripts/generate-secret.mjs          # 32 bytes (256-bit)
node scripts/generate-secret.mjs 64      # 64 bytes (512-bit)
```

The output of the generator is a **secret** — put it in `.env` only, never in
Git, chat, or logs.

`.env` is local-only. Each developer has their own. The central config module
(`apps/identity-server/src/config/env.ts`) validates all variables with Zod at
startup and **exits** if a required value is missing or invalid.

## 5. `.env.example` usage

- Template file committed to the repo: `.env.example`
- Contains placeholders **only** — never real values
- Required values are marked `REQUIRED` in comments
- Copy it to `.env` (gitignored), fill in real values locally

## 6. Secret generation

Generate secrets locally and keep them out of Git:

```bash
# Node.js — 32 bytes (recommended minimum)
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# Node.js — 64 bytes
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"

# Project helper (same thing)
node scripts/generate-secret.mjs
```

### Signing key generation (RSA RS256)

The identity server's `KeyStore` generates a fresh RSA key pair on first boot
and persists it (owner-only file permissions) to `PEZHWAN_SIGNING_KEYS_PATH`
(default `./keys`). That directory is gitignored. For production, provide the
key via a mounted secret file or a secret manager instead of committing it:

```bash
# Generate a standalone RSA key pair for manual/HA provisioning (offline):
openssl genrsa -out signing_private.pem 2048
openssl rsa -in signing_private.pem -pubout -out signing_public.pem
```

Store the private key in a secret manager; only the **public** key may live in
the repo (e.g. in JWKS).

## 7. Production secret management

The application supports interchangeable secret providers via the
`SecretProvider` abstraction in `packages/core/src/secretProvider.ts`:

```ts
interface SecretProvider {
  getSecret(name: string): Promise<string>;
  getOptionalSecret(name: string): Promise<string | undefined>;
}
```

Provided implementations:

| Provider | Use case |
|----------|----------|
| `EnvSecretProvider` | Development / simple production (env vars) |
| `FileSecretProvider` | Docker/Kubernetes mounted secret files |
| `ChainSecretProvider` | Try providers in order, e.g. file then env |
| `createSecretProvider()` | Convenience factory |

**Production options (choose one, no code change needed):**

- **AWS Secrets Manager** / **AWS KMS** — implement `SecretProvider` calling
  `GetSecretValue`/`Decrypt` via the AWS SDK.
- **Google Secret Manager** — `SecretProvider` over `SecretManagerServiceClient`.
- **Azure Key Vault** — `SecretProvider` over `@azure/keyvault-secrets`.
- **HashiCorp Vault** — `SecretProvider` over `vault` Node client.
- **Kubernetes Secrets** — mount secret files and use `FileSecretProvider`.
- **Docker Secrets** — mount `/run/secrets/*` and use `FileSecretProvider`.

Because auth logic only talks to `SecretProvider`, swapping the backing store
does **not** require rewriting authentication code.

Never hard-code a provider SDK into the app; pass the provider in via config.

### Production startup invariants

The identity server rejects production configuration unless:

- `PEZHWAN_ISSUER` uses `https://`
- `PEZHWAN_COOKIE_SECURE=true`
- signing-key rotation is enabled
- `PEZHWAN_ALLOWED_ORIGINS` contains no wildcard

Boolean environment values are parsed explicitly, so the string `false` is not
mistaken for a truthy value.

## 8. Secret rotation

Assume any secret that was ever committed to GitHub or shared externally is
**compromised**. Do not just hide it — rotate it.

### For JWT signing keys (RSA)

The `KeyStoreService.rotate()` generates a new key and persists all non-expired
keys, so previously-issued tokens remain verifiable via JWKS until expiry.

1. Call `store.rotate()` (via admin/ops) to issue a new key.
2. Keep the old key until all tokens signed with it expire.
3. Remove the old key after expiry.

For a full cutover:

```bash
# I. Issue a NEW signing key
#  - generate a fresh RSA pair offline, or
#  - deploy through the KeyStore rotate() path

# II. Replace the current signing secret in the secret manager
#  - AWS Secrets Manager: aws secretsmanager put-secret-value --secret-id ...
#  - Kubernetes: kubectl create secret ... / rollout restart
#  - Vault: vault write secret/pezhwan-signing ...

# III. Restart instances so they pick up the new key

# IV. Verify old key no longer authenticates
#  - old access/refresh tokens are rejected (after expiry)
#  - /v1/services/ping with the old API key returns 401
```

### For environment secrets (database passwords, client secrets, API keys)

1. Identify every place the secret was used.
2. Rotate it at the source (DB provider, OAuth developer console, SMTP host).
3. Update the secret in the secret manager / `.env` (production).
4. Restart the service.
5. Verify the old credential can no longer authenticate.
6. Re-scan repository history (see below).

## 9. Safe key-generation procedure

- Generate secrets locally, never on a shared CI or in the cloud.
- Use at least 32 random bytes for symmetric secrets and JWT secrets.
- Use a CSPRNG (`crypto.randomBytes` / `/dev/urandom`).
- Store private keys in a secret manager with access control and audit logging.
- Restrict file permissions to owner-only (`0o600` / `0o700`).
- Back up keys in a secure keystore; a lost key invalidates all tokens.

## 10. GitHub secret scanning & push protection

**Recommended GitHub org/repo settings:**

- Enable **Secret Scanning** (free for public repos; Advanced Security for
  private). GitHub will alert on known credential patterns (AWS, Stripe,
  npm, etc.).
- Enable **Push Protection** so pushes containing detected secrets are blocked.
- Enable **Dependabot** for automated dependency + security updates.
- Enable **Security advisories** for coordinated disclosure.
- **Branch protection** on `main`:
  - Require pull request reviews
  - Require status checks (the `Security` workflow above)
  - Require up-to-date branches
  - Do not allow force-push by default

### If a secret is in Git history

Deleting the file in the latest commit does **NOT** remove it from history.
Remediation:

1. **Revoke/rotate** the credential immediately (it is compromised).
2. **Remove** the secret from the repository.
3. **Rewrite history** if necessary (e.g. `git filter-repo` /
   `filter-branch`, or BFG Repo-Cleaner) to purge it.
4. **Force-push** only under controlled conditions (single committer, after
   review). Coordinate with your team.
5. **Verify** the old credential is invalid (attempt to use it).
6. **Re-scan** the full history with Gitleaks / GitHub to confirm it is gone.

## 11. Incident response — a secret leaked

1. **Rotate immediately.** Treat it as compromised the moment it's public.
2. **Disable** the affected credential / key.
3. **Determine blast radius** — everywhere the secret was used or referenced.
4. **Purge** the secret from the repo and history (see above).
5. **Notify** impacted users / customers if sensitive data could be exposed.
6. **Review** access logs for signs of unauthorized use.
7. **Add** the pattern to the secret scanner to prevent recurrence.
8. **Document** the incident (post-incident review).

## 12. Key rotation procedures

- Schedule regular rotation (e.g. signing keys monthly, client secrets on
  personnel change / compromise).
- Automate where possible via CI + a secret manager.
- Keep a rotation playbook (like this doc) so it's repeatable.
- Validate with tests that old and new keys behave correctly (see
  `tests/security/backstop-security.test.ts`).

## 13. Frontend / public environment variable rules

Anything in the frontend build **is public**. The React SDK
(`packages/react`) exposes only, and never stores:

- **Public**: `VITE_API_URL` (or the SDK `baseUrl`), public OAuth `clientId`.
- **Never**: client secrets, JWT signing keys, DB credentials, API keys,
  SMTP passwords, admin credentials.

Rules:

- Do not prefix private secrets with `VITE_`.
- Never put secrets in `localStorage`/`sessionStorage`.
- The React SDK stores only a non-sensitive identity cache (id/email/roles),
  and tokens live in `httpOnly` cookies.

## 14. Centralized config — where to find it

- `apps/identity-server/src/config/env.ts` — Zod-validated environment schema,
  typed config object, fail-fast on missing required values.
- `apps/identity-server/src/config/index.ts` — re-exports.
- Server code imports `config` from this module; **no direct `process.env`**
  access in app logic.

## 15. Logging & error hygiene

- The structured logger (`packages/core/src/services/logger.service.ts`)
  redacts sensitive field names automatically (password, tokens, secrets,
  keys, cookies, Authorization headers, connection strings, etc.).
- Production error responses never expose stack traces, connection strings,
  or internal paths — they return a safe `{ success:false, error:{ code,
  message, requestId } }` shape; details go only to server-side logs.

## 16. Secret scanning

- **Pre-commit**: `node scripts/secret-scan.mjs` (installed as a git hook via
  `npm run setup`). Blocks commits that stage obvious secrets.
- **CI**: `.github/workflows/security.yml` runs the scanner plus **Gitleaks**
  (via `gitleaks-action`) and fails the build on detection.
- **Tools to add/use**: **Gitleaks**, **GitHub Secret Scanning + Push
  Protection**, **TruffleHog**, and `npm audit` for dependencies.

Review these files manually (they contain authorized test-only dummy values):
- `packages/core/test/security.test.ts`
- `tests/security/backstop-security.test.ts`
- `packages/oauth/test/oauth.test.ts`
