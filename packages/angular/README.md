# @pezhwan/angular

Angular SDK for PEZHWAN — `PezhwanModule` with `AuthService`, `SessionService`,
an HTTP interceptor that attaches the access token, and a route guard.

## Install

```bash
npm install @pezhwan/angular @angular/core @angular/common @angular/router rxjs
```

## Setup

```ts
import { NgModule } from '@angular/core';
import { PezhwanModule } from '@pezhwan/angular';

@NgModule({
  imports: [PezhwanModule.forRoot({ baseUrl: 'https://api.example.com' })],
})
export class AppModule {}
```

## Usage

```ts
const auth = inject(AuthService);          // user$, login(), logout(), accessToken()
await auth.login({ email, password });

const session = inject(SessionService);    // list(), revoke(id), revokeAll(), refresh()
const canActivate = [pezhwanAuthGuard];   // redirects guests to /login
```

The route guard is a UX convenience; the server enforces every authorization
decision via `@pezhwan/express` middleware.