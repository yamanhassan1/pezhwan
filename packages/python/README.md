# PEZHWAN Python SDK

Zero-dependency client for the [PEZHWAN Identity Server](https://pezhwan.dev)
REST API (`/v1/auth`, `/v1/sessions`, `/v1/mfa`, `/v1/verify`, ...).

## Install

```bash
pip install pezhwan          # from PyPI
pip install .                # from this directory
```

Requires Python 3.9+. The only runtime dependency is the standard library.

## Quick start

```python
import pezhwan

client = pezhwan.PezhwanClient(base_url="http://localhost:4011")

# Password login (returns an MFA challenge when MFA is required)
tokens, challenge = client.auth.login(email="demo@pezhwan.dev", password=os.environ["PEZHWAN_DEMO_PASSWORD"])
if challenge and challenge.mfa_required:
    tokens, _ = client.mfa.login(challenge.user_id, "123456")

# Authenticated calls now carry the bearer token automatically
sessions = client.sessions.list()
client.sessions.revoke(sessions[0].id)
me = client.auth.me()
```

## Features

- **Register / login / logout / refresh** — `client.auth.*`
- **OTP flows** — `send/verify/login` with email or phone targets
- **Password management** — change, forgot (token issuance), reset
- **Sessions** — list, revoke one, revoke all
- **MFA** — TOTP setup, enable, step-up verify, disable, MFA login
- **Strict error typing** — `PezhwanApiError` (4xx/5xx), `PezhwanAuthError`
  (401), `PezhwanRateLimitError` (429, with `retry_after_seconds`)
- **Token injection** — set `client.token = "..."` or chain
  `client.bearer_token("...")`

## Envelope

Responses are parsed into a typed `Envelope` model mirroring the server's
`{ success, data, error }` contract. Convenience helpers on service methods
unwrap `data` into typed models (`LoginTokens`, `User`, `Session`,
`MfaChallenge`, `MfaSetup`).

## License

MIT.