/**
 * PEZHWAN — modular Express routers barrel.
 *
 * Re-exports every create*Router factory under src/routes/ (including the
 * mirrors of the flat routes.ts / routes.oauth.ts / routes.extra.ts modules).
 */

export * from './auth.routes.ts';
export * from './session.routes.ts';
export * from './oauth.routes.ts';
export * from './mfa.routes.ts';
export * from './verification.routes.ts';
export * from './admin.routes.ts';
export * from './compliance.routes.ts';
export * from './developer.routes.ts';
export * from './graphql.routes.ts';
export * from './scim.routes.ts';
export * from './subscription.routes.ts';
export * from './team.routes.ts';
export * from './webhook.routes.ts';
