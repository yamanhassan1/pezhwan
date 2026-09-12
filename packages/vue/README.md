# @pezhwan/vue

Vue 3 SDK for PEZHWAN — plugin, composables and auth components.

## Install

```bash
npm install @pezhwan/vue vue
```

## Quick start

```ts
import { createApp } from 'vue';
import { pezhwan } from '@pezhwan/vue';
import App from './App.vue';

createApp(App).use(pezhwan, { baseUrl: 'https://api.example.com' }).mount('#app');
```

## Composable surface

```ts
const { state, login, register, logout, isAuthenticated } = useAuth();
const { sessions, revokeSession, revokeAllSessions } = useSession();
const mfa = useMFA(); // beginSetup / enable / verify / completeMfaLogin / disable
```

## Components

`<LoginForm>`, `<RegisterForm>`, `<ProtectedRoute fallbackPath="/login">`.

Frontend gates are a UX layer — the server enforces every decision via
`@pezhwan/express` middleware.