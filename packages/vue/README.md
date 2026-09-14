# @pezhwan/vue

The Vue 3 SDK for PEZHWAN — a plugin, composables, and a few ready-made
components that mirror the [`@pezhwan/react`](../react/README.md) surface, so
switching frameworks stays low-effort.

## Installation

```bash
npm install @pezhwan/vue
```

Vue 3 is a peer dependency.

## Quick start

Install the plugin with your PEZHWAN API origin. This provides the shared
config to every component tree:

```ts
import { createApp } from 'vue';
import { pezhwan } from '@pezhwan/vue';
import App from './App.vue';

createApp(App).use(pezhwan, { baseUrl: 'https://api.example.com' }).mount('#app');
```

The plugin throws at startup if `baseUrl` is missing — misconfiguration fails
fast, not at first request.

## Auth

```vue
<script setup lang="ts">
import { useAuth } from '@pezhwan/vue';

const { state, login, register, logout, refreshProfile, isAuthenticated } = useAuth();
</script>

<template>
  <p v-if="state.status === 'loading'">Loading…</p>

  <form v-else-if="!isAuthenticated" @submit.prevent="login({ email, password })">
    <!-- email + password inputs -->
  </form>

  <p v-else>Welcome, {{ state.user?.email }}! <button @click="logout">Sign out</button></p>
</template>
```

`state` is a shared singleton (`user`, `status`, `error`) with `user` reactive —
`useAuth()` returns the same state from any component, so a login in a child
component is immediately visible everywhere. `bootstrapAuth()` re-hydrates the
session from `localStorage` on app start.

## Sessions

```ts
import { useSession, loadSessions } from '@pezhwan/vue';

const { sessions, revokeSession, revokeAllSessions } = useSession();
await loadSessions(); // { _id, device, ip, userAgent, createdAt, ... }
```

## MFA

```ts
import { useMFA } from '@pezhwan/vue';

const mfa = useMFA();
await mfa.beginSetup(); // { secret?, otpauthUrl?, backupCodes? }
await mfa.enable(code);
const { verified } = await mfa.verify(code);
const result = await mfa.completeMfaLogin(userId, code);
await mfa.disable(code);
```

## Components

Registered for you; import them from the package and use them in templates:

| Component                                  | Usage                                                     |
| ------------------------------------------ | --------------------------------------------------------- |
| `<LoginForm />`                            | Email/phone + password sign-in form.                      |
| `<RegisterForm />`                         | Registration form (`onSuccess` prop, emits `success`).    |
| `<ProtectedRoute fallbackPath="/login" />` | Render children only when authenticated; redirect guests. |

```vue
<script setup lang="ts">
import { LoginForm, RegisterForm, ProtectedRoute } from '@pezhwan/vue';
</script>

<template>
  <ProtectedRoute fallback-path="/login">
    <main>Only for signed-in users.</main>
  </ProtectedRoute>
</template>
```

> As with every Pezhwan frontend SDK, these gates are a **UX layer** — every
> authorization decision is enforced server-side by `@pezhwan/express`
> middleware.

## Config access

`usePezhwanConfig()` returns the active plugin options, and `getActiveConfig()`
resolves the current config from anywhere (throwing when the plugin is not
installed) — the composables use it internally.

## Related docs

- [`@pezhwan/react`](../react/README.md) — the sibling React SDK with the same surface.
- [`docs/developer/GETTING-STARTED.md`](../../docs/developer/GETTING-STARTED.md) — boot the server your app talks to.
- [`@pezhwan/express`](../express/README.md) — server-side middleware that validates browsers.
