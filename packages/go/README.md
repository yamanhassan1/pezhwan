# PEZHWAN Go SDK

Zero-dependency Go client for the [PEZHWAN Identity Server](https://pezhwan.dev)
REST API. Uses only the Go standard library — no third-party modules.

## Install

```bash
go get github.com/pezhwan/pezhwan-go@latest
```

Requires Go 1.21+.

## Quick start

```go
package main

import (
    "context"
    "fmt"

    "github.com/pezhwan/pezhwan-go/pezhwan"
)

func main() {
    ctx := context.Background()
    client := pezhwan.NewClient("http://localhost:4011")

    tokens, challenge, err := client.Auth.Login(ctx, "Str0ng!Pass#2026", "demo@pezhwan.dev", "")
    if err != nil {
        panic(err)
    }
    if challenge != nil && challenge.MfaRequired {
        tokens, err = client.MFA.Login(ctx, challenge.UserID, "123456")
        if err != nil {
            panic(err)
        }
    }
    client.SetToken(tokens.AccessToken)

    sessions, _ := client.Sessions.List(ctx)
    _ = client.Sessions.Revoke(ctx, sessions[0].ID)
    me, _ := client.Auth.Me(ctx)
    fmt.Println("logged in as", me.Email)
}
```

## Features

- **Auth** — register, password login (MFA-aware), OTP send/verify/login,
  logout, refresh, password forgot/reset, email verify, `Me`
- **Sessions** — list, revoke one, revoke all
- **MFA** — TOTP setup, enable, step-up verify, disable, MFA login
- **Typed errors** — `*Error` carries HTTP status + envelope code; helpers
  `IsRateLimit`, `WasAuth`
- **Context-aware** — every call takes a `context.Context`
- **Zero deps** — `go.mod` lists no third-party modules

## Options

```go
client := pezhwan.NewClient(
    "http://localhost:4011",
    pezhwan.WithAccessToken("..."),
    pezhwan.WithTenantID("000000000000000000000001"),
    pezhwan.WithHTTP(&http.Client{Timeout: 10 * time.Second}),
)
```

## License

MIT.
