# PEZHWAN Java SDK

Zero-dependency Java client for the [PEZHWAN Identity Server](https://pezhwan.dev)
REST API. Uses only the JDK (`java.net.http.HttpClient`) — no third-party deps.

## Install

```xml
<dependency>
  <groupId>dev.pezhwan</groupId>
  <artifactId>pezhwan-java</artifactId>
  <version>0.1.0</version>
</dependency>
```

Requires Java 17+. Build with Maven (`mvn package`) or point any build tool at
`src/main/java`.

## Quick start

```java
import com.pezhwan.PezhwanClient;
import com.pezhwan.AuthService;
import com.pezhwan.Models;

PezhwanClient client = new PezhwanClient.Builder("http://localhost:4011")
        .build();

AuthService.LoginResult result = client.auth.loginByEmail("demo@pezhwan.dev", "Str0ng!Pass#2026");
if (result.challenge() != null) {
    client.mfa.login(result.challenge().userId(), "123456");
} else {
    client.setToken(result.tokens().accessToken());
}

var sessions = client.sessions.list();       // List<Models.Session>
var me = client.auth.me();                   // Models.User

try {
    client.sessions.revoke(sessions.get(0).id());
} catch (PezhwanException.PezhwanApiException e) {
    System.err.println(e.status() + " " + e.code());
}
```

## Features

- **Auth** — register, password login (MFA-aware), OTP send/verify/login,
  logout, refresh, password forgot/reset, email verify, `me`
- **Sessions** — list, revoke one, revoke all
- **MFA** — TOTP setup, enable, step-up verify, disable, MFA login
- **Typed models** — `LoginTokens`, `User`, `Session`, `MfaChallenge`,
  `MfaSetup`, `Envelope`
- **Typed errors** — `PezhwanException.PezhwanApiException` with `status()` +
  `code()`; `isAuthFailure()` / `isRateLimited()` helpers
- **JSON + TLS built in** — no Jackson/Gson needed (hand-rolled minimal JSON
  codec; trust-all TLS opt-in for dev hosts)

## License

MIT.