# PEZHWAN .NET SDK

Typed C# client for the [PEZHWAN Identity Server](https://pezhwan.dev) REST API.
Uses only the BCL (`System.Net.Http` + `System.Text.Json`) — no NuGet deps.

## Install

```bash
dotnet add package Pezhwan      # from NuGet
dotnet build .                  # from this directory
```

Requires .NET 8+.

## Quick start

```csharp
using Pezhwan;

var client = PezhwanClient.Create("http://localhost:4011");

var result = await client.Auth.LoginAsync("Str0ng!Pass#2026", email: "demo@pezhwan.dev");
if (result.Challenge is { MfaRequired: true } challenge)
{
    var withMfa = await client.Mfa.LoginAsync(challenge.UserId, "123456");
    client.AccessToken = withMfa.AccessToken;
}
else
{
    client.AccessToken = result.Tokens!.AccessToken;
}

var sessions = await client.Sessions.ListAsync();
await client.Sessions.RevokeAsync(sessions[0].Id);
var me = await client.Auth.MeAsync();
Console.WriteLine($"Logged in as {me.Email}");
```

## Features

- **Auth** — register, password login (MFA-aware), OTP send/verify/login,
  logout, refresh, password forgot/reset, email verify, `Me`
- **Sessions** — list, revoke one, revoke all
- **MFA** — TOTP setup, enable, step-up verify, disable, MFA login
- **Typed models** — `LoginTokens`, `User`, `Session`, `MfaChallenge`,
  `MfaSetup`, `Envelope`
- **Typed errors** — `PezhwanApiException` with `Status` + `Code`;
  `IsAuthFailure` / `IsRateLimited` helpers; `PezhwanNetworkException`
- **Cancellation** everywhere via `CancellationToken`

## License

MIT.
