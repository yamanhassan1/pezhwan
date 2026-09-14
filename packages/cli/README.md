# @pezhwan/cli

The PEZHWAN command-line client. It talks to a running PEZHWAN identity server
through its REST surface, keeps your connection profile in
`~/.pezhwan/config.json`, and prints JSON or a narrow table for every command.

```bash
npm exec pezhwan -- health          # or run via the workspace build
```

## First-time setup

Tell the CLI where your server lives. Two ways — the flag form:

```bash
pezhwan config --set baseUrl http://localhost:4011
```

or the `--set=key=value` form:

```bash
pezhwan config --set=baseUrl=http://localhost:4011
pezhwan config --set=token=eyJ...   # pre-seed an access token
```

Verify and inspect the masked profile:

```bash
pezhwan config
# { "path": "C:\\Users\\you\\.pezhwan\\config.json", "baseUrl": "http://localhost:4011", "token": "eyJ…****" }
```

## Authenticate

```bash
pezhwan auth login --email admin@example.com --password '…'
# Authenticated; token saved to profile

pezhwan auth whoami                 # GET /v1/users/me
pezhwan auth logout                 # clears the stored token
```

`auth login` posts to `POST /v1/auth/login` and stores the returned access
token in the profile so every following command is authenticated automatically.

## Command reference

| Command    | What it does                                                                                                                                                                   | Flags                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `health`   | Check connectivity and report the server's OIDC discovery document + admin status.                                                                                             | —                                                                                                |
| `auth`     | `login` (email/password), `whoami`, `logout`.                                                                                                                                  | `--email`, `--password`, subcommand                                                              |
| `users`    | List users.                                                                                                                                                                    | —                                                                                                |
| `sessions` | List the authenticated user's active sessions.                                                                                                                                 | —                                                                                                |
| `clients`  | List registered OAuth clients; show one.                                                                                                                                       | `--id <id>`                                                                                      |
| `roles`    | List roles and their permissions.                                                                                                                                              | —                                                                                                |
| `tenants`  | List tenants.                                                                                                                                                                  | —                                                                                                |
| `audit`    | Read recent audit events.                                                                                                                                                      | `--limit <n>` (default 100)                                                                      |
| `keys`     | Generate a local RSA keypair for signing/verification into `./pezhwan-keys/` (no server round-trip; upload the public key to the runtime KeyStore to enable external signing). | —                                                                                                |
| `migrate`  | Ask the server to run its migrations.                                                                                                                                          | `--dir <migrations-dir>`                                                                         |
| `backup`   | Trigger a server-side backup.                                                                                                                                                  | `--target <dir>`                                                                                 |
| `config`   | Show or update the connection profile.                                                                                                                                         | `--set <key> <value>` where key is `baseUrl` or `token`                                          |
| `webhooks` | List webhook endpoints; show one; register a new one.                                                                                                                          | `--id <id>`, or `--create --url <url> --events <e1,e2>` (+ optional `--tenant`, `--application`) |

### Examples

```bash
# Key rotation helper: mint a fresh signing keypair locally
pezhwan keys
# Keypair written to .../pezhwan-keys/public.pem
# SHA256 fingerprint: 00:11:22:…

# Register a webhook that receives user.auth events
pezhwan webhooks --create --url https://app.example.com/hooks/auth --events user.auth

# Register a webhook scoped to a specific tenant/application
pezhwan webhooks --create --url https://app.example.com/hooks/a --events tenant.created \
  --tenant tenant-b --application app-b

# Audit trail, last 50 events
pezhwan audit --limit 50
```

## Behaviour and exit codes

- Every command talks to the REST surface using the profile's `baseUrl` +
  `Authorization: Bearer <token>`; anything without a profile or token fails
  loudly with instructions.
- Output is JSON (`pezhwan audit`, `pezhwan health`, `pezhwan webhooks --id`)
  or a table (`users`, `sessions`, `clients`, `roles`, `tenants`, `webhooks`).
- A failed call prints the server's error envelope message (e.g.
  `FEATURE_NOT_ENABLED: ...`) and exits `1`. Commands whose endpoint the server
  has not enabled never fabricate data — they surface the server's error.
- `pezhwan help` (or no arguments) prints the command list + profile path.
- The token is stored **plaintext** in your own profile file (`~/.pezhwan/config.json`),
  which is readable only by your OS user. Treat it like any credential file.

## Related docs

- [`docs/developer/GETTING-STARTED.md`](../../docs/developer/GETTING-STARTED.md) — boot a server to point this CLI at.
- [`docs/api/errors.md`](../../docs/api/errors.md) — the error codes the CLI surfaces.
- [`docs/api/webhooks.md`](../../docs/api/webhooks.md) — what `pezhwan webhooks` manages.
