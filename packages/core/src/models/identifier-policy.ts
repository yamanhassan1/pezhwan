/**
 * PEZHWAN — centralized identifier policy.
 *
 * Defines the canonical TYPE of every identifier in the system. All Mongoose
 * models MUST follow this policy so the whole stack (JWT claims, IdentityContext,
 * config, queries, Mongo docs) uses one consistent representation.
 *
 * RATIONALE:
 * - tenantId/applicationId are OPAQUE external identifiers configured by the
 *   deployment (e.g. `PEZHWAN_TENANT_ID=dev-tenant`). They are referenced in
 *   JWT claims, HTTP requests, config and every query. Treating them as Mongo
 *   ObjectIds breaks every string-typed caller (see the historic "Cast to
 *   ObjectId failed for value \"dev-tenant\"" bug) and leaks schema internals.
 * - userId/sessionId are INTERNAL identifiers of Mongo documents, but they are
 *   used as opaque STRINGS across the SDK (JWT `sub`, session management).
 *   We therefore store them as strings and let Mongo generate the ObjectId
 *   `_id` internally — the `_id` is never the identity authors hold.
 *
 * POLICY (source of truth):
 * | Identifier          | Type   | Example                          |
 * |---------------------|--------|----------------------------------|
 * | tenantId            | String | "dev-tenant"                     |
 * | applicationId       | String | "dev-app"                        |
 * | userId              | String | "65f0... (user _id as string)"   |
 * | sessionId           | String | "65f0... (session _id as string)"|
 * | roleId              | String | role _id as string               |
 * | permissionId        | String | permission _id as string         |
 * | oauthClientId       | String | "dev-client"                     |
 * | apiKeyId            | String | api key hash lookup              |
 *
 * Where a value references the Mongo `_id` of another collection, it is stored
 * as a String; `ref` metadata is retained ONLY for readability/documentation and
 * is not used for population. Conversions to ObjectId must never be performed in
 * application code — they were the cause of the cast bug.
 */
export const IDENTIFIER_POLICY = Object.freeze({
  tenantId: 'string',
  applicationId: 'string',
  userId: 'string',
  sessionId: 'string',
  roleId: 'string',
  permissionId: 'string',
});
