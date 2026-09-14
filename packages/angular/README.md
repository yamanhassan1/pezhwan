# @pezhwan/angular

The Angular SDK for PEZHWAN — an `NgModule` that wires authentication, session
management, a token-attaching HTTP interceptor, and a route guard into your app
with a single call.

## Installation

```bash
npm install @pezhwan/angular @angular/core @angular/common @angular/router rxjs
```

`@angular/core`, `@angular/common`, `@angular/router`, and `rxjs` are peer
dependencies.

## Setup

```ts
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { PezhwanModule } from '@pezhwan/angular';

@NgModule({
  imports: [
    RouterModule.forRoot([]), // required by the route guard
    PezhwanModule.forRoot({ baseUrl: 'https://api.example.com' }),
  ],
})
export class AppModule {}
```

`forRoot` registers `AuthService`, `SessionService`, and the bearer-token HTTP
interceptor, and makes the config available to inject anywhere via
`PEZHWAN_CONFIG`.

### Config

```ts
interface PezhwanAuthConfig {
  baseUrl: string;
  /** localStorage key holding the raw access token (default `pezhwan.access_token`). */
  tokenKey?: string;
}
```

## Authentication

```ts
import { Component, inject } from '@angular/core';
import { AuthService, type PezhwanUser } from '@pezhwan/angular';

@Component({/* ... */})
export class LoginComponent {
  private readonly auth = inject(AuthService);

  user$ = this.auth.user$; // Observable<PezhwanUser | null>
  ready$ = this.auth.isAuthenticated$; // Observable<boolean>

  async login(email: string, password: string) {
    const user: PezhwanUser = await this.auth.login({ email, password });
    this.user$.subscribe();
  }

  logout() {
    this.auth.logout();
  }
}
```

### `AuthService` surface

| Member             | Type                              | Purpose                                                                 |
| ------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| `user$`            | `Observable<PezhwanUser \| null>` | Reactive current user (restored from the stored token on construction). |
| `isAuthenticated$` | `Observable<boolean>`             | Reactive authentication flag.                                           |
| `isAuthenticated`  | `boolean`                         | Synchronous snapshot.                                                   |
| `user()`           | `PezhwanUser \| null`             | Synchronous snapshot of the current user.                               |
| `accessToken()`    | `string \| null`                  | The raw access token from `localStorage`.                               |
| `login(input)`     | `Promise<PezhwanUser>`            | Email/phone + password sign-in against `POST /v1/auth/login`.           |
| `logout()`         | `Promise<void>`                   | Best-effort `POST /v1/auth/logout`, then clears token + user state.     |

`PezhwanUser` is `{ id, tenantId?, applicationId?, email?, phone?, roles? }`.

> The Angular SDK is a **client** SDK — there is deliberately no
> `register()` method. Self-service registration flows (if you use them) run
> through the server's `POST /v1/auth/register`, for example via a
> `@pezhwan/express`-mounted endpoint or `@pezhwan/node` in an API route you
> control.

## HTTP interceptor

Registered automatically by `PezhwanModule`. `AuthInterceptor` attaches
`Authorization: Bearer <token>` to every outgoing request whenever a token is
present (`accessToken()` from the token store). Use `HttpClient` as usual in
your services — auth headers just appear.

You can also provide the interceptor component explicitly:

```ts
import { AUTH_INTERCEPTOR_PROVIDER, AuthInterceptor } from '@pezhwan/angular';
// AUTH_INTERCEPTOR_PROVIDER = { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
```

## Route guard

```ts
import { Routes } from '@angular/router';
import { pezhwanAuthGuard } from '@pezhwan/angular';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent, canActivate: [pezhwanAuthGuard] },
  { path: 'login', component: LoginComponent },
];
```

`pezhwanAuthGuard` lets authenticated users through and redirects guests to
`/login`, preserving the target URL as `?redirect=...` so you can send them
back after login. It is a convenience — the server enforces real authorization.

## Sessions

```ts
import { inject } from '@angular/core';
import { SessionService } from '@pezhwan/angular';

const session = inject(SessionService);

// Reactive list of the current user's active sessions.
session.sessions$.subscribe((sessions) => (this.sessions = sessions));

await session.refresh(); // re-pull from GET /v1/sessions
await session.revoke(sessionId); // POST /v1/sessions/:id/revoke
await session.revokeAll(); // POST /v1/sessions/all/revoke
```

> `SessionService` exposes sessions reactively via `sessions$` (`Observable<Array<PezhwanSession>>`).
> Earlier releases documented a `list()` method — that no longer exists; call
> `refresh()` to pull the latest list and re-render from `sessions$`.

## Related docs

- [`@pezhwan/react`](../react/README.md) and [`@pezhwan/vue`](../vue/README.md) — the same SDK for other frameworks.
- [`docs/developer/GETTING-STARTED.md`](../../docs/developer/GETTING-STARTED.md) — boot the server your app talks to.
- [`@pezhwan/express`](../express/README.md) — server-side middleware that validates browsers.
