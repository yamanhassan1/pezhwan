/**
 * PEZHWAN — authorization hook.
 *
 * Returns the `can(permission)` predicate exposed by the auth context. This is
 * a UX-layer shortcut only; every authorization decision is enforced
 * server-side by @pezhwan/express middleware.
 */

export { useAuthorization } from '../index.tsx';
