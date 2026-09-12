# Plugin Development

Pezhwan exposes a small, typed plugin system in
`packages/core/src/plugins/` — a hook bus, a loader, and a lifecycle manager.
Pluggable delivery transports (OTP email/SMS, payment, storage) and developer
capabilities build on the same mechanism.

## Concepts

Three pieces, in dependency order:

| Piece | Module | Responsibility |
| --- | --- | --- |
| `Hooks` | `src/plugins/hooks.ts` | Typed event bus. Plugins register handlers under named hooks; the runtime invokes them in registration order. |
| `PluginLoader` | `src/plugins/plugin-loader.ts` | Resolves a manifest's `entry` (module specifier or path) and imports it. Loads are cached by resolved URL. |
| `PluginManager` | `src/plugins/plugin-manager.ts` | Owns lifecycle: loads via the loader, activates a plugin's hooks into the bus, toggles `enable`/`disable`, tracks per-plugin status, and quarantines plugins that fail to load. |

The shared types `PluginContext`, `PluginManifest`, and
`PluginRegistrationResult` (from `packages/shared/src/types/plugin.types.ts`)
are re-exported from the `@pezhwan/core` root; the runtime classes are exported
from the plugins barrel:

```ts
import { Hooks, PluginLoader, PluginManager } from '@pezhwan/core/src/plugins';
```

## Hook contract

```ts
// src/plugins/hooks.ts
export interface HookContext {
  event: string;                 // hook name, e.g. 'user.registered'
  payload: Record<string, unknown>;
}
export type HookHandler = (context: HookContext) => void | Promise<void>;
```

The `Hooks` class API:

- `register(name, handler)` — appends a handler and returns an unsubscribe
  function (removes exactly that handler).
- `has(name)` — true when at least one handler is registered.
- `run(name, context)` — awaits handlers in order; returns `true` when **every**
  handler completed, `false` if any handler threw (fail-visible, non-throwing
  bus — the caller decides how to react).

```ts
const hooks = new Hooks();
const unsubscribe = hooks.register('user.registered', async (ctx) => {
  // ctx.event === 'user.registered'; ctx.payload holds the event payload
});
const allHandlersSucceeded = await hooks.run('user.registered', {
  event: 'user.registered',
  payload: { userId: '...', email: 'user@example.com' },
});
```

## Plugin manifests

There are two related shapes — do not confuse them:

| Type | Source | Fields | Purpose |
| --- | --- | --- | --- |
| `PluginManifest` (shared) | `packages/shared/src/types/plugin.types.ts` | `name`, `version`, `description?`, `provides: string[]` | Declarative capability declaration (e.g. `['email-provider', 'captcha-provider']`); re-exported by `@pezhwan/core`. |
| `PluginManifest` (loader) | `packages/core/src/plugins/plugin-loader.ts` | `name`, `version`, `entry`, `enabled?` | Runtime manifest consumed by `PluginLoader`/`PluginManager`; `entry` is the module to import. |

`PluginLoaderOptions` accepts `enabledOnly` (throw when a disabled plugin is
loaded) and `deps` (a `Record<string, unknown>` of runtime dependencies handed
to factory-loaded plugins).

## Lifecycle

1. **Construct**: `new PluginManager(loader, hooks)`.
2. **Load**: `manager.load(manifest)` → the loader imports `entry`. A plug
   module's default export (or module namespace) becomes `exports`; if it is an
   object with a `hooks` property containing functions, each key/value pair is
   registered on the bus in `activateHooks`.
   Status becomes `active` (or `disabled` when `manifest.enabled === false`).
   A thrown load error produces state `error` with `lastError`; the plugin is
   quarantined but the manager keeps running.
3. **Enable/disable**: `manager.enable(name)` re-activates (and re-registers
   hook handlers); `manager.disable(name)` marks the plugin disabled.
4. **Inspect**: `manager.list()` returns `PluginStatus[]`
   (`state: 'active' | 'disabled' | 'error'`, optional `lastError`);
   `manager.get(name)` returns one status.

## Plugin module contract

A plugin module exports a default object. Two things are read from it:

- an optional `hooks` **array** of hook names (reported on `LoadedPlugin`, from
  `plugin-loader.ts`), and
- an optional `hooks` **object** mapping hook name → handler (registered by the
  manager in `activateHooks`).

Example skeleton:

```ts
// plugins/onboarding/index.ts
export default {
  hooks: {
    'user.registered': async (ctx) => {
      const { payload } = ctx;
      await sendWelcome(payload.email);          // side effect, never blocks auth
    },
    'login.succeeded': (ctx) => {
      track(ctx.payload.userId);                 // void handlers are fine too
    },
  },
};
```

```ts
// registration
const hooks = new Hooks();
const manager = new PluginManager(new PluginLoader(), hooks);
const status = await manager.load({
  name: 'onboarding',
  version: '1.0.0',
  entry: './plugins/onboarding/index.ts',
});
if (status.state === 'error') {
  console.error(`plugin failed to load: ${status.lastError}`);
}
```

## Rules for plugin authors

- Hooks run after the core operation has committed; never make a hook handler
  able to roll back auth decisions — treat payloads as already-happened events.
- Keep handlers fast and failure-isolated. A throwing handler flips
  `Hooks.run` to `false` but never aborts other handlers or the caller unless
  the caller chooses to react.
- Never log secrets. Payloads may contain user data; redact before logging.
- Declare capabilities in the shared manifest (`provides`) and reference a real
  `entry` in the loader manifest.
- Test the plugin as a plain module against the `Hooks` bus — no infrastructure
  required (see `testing.md` for the unit-test pattern).