/**
 * PEZHWAN — OAuth router facade.
 *
 * Modular mirror of ./routes.oauth.ts. Mount at /v1/oauth
 * (/authorize /token /clients /.well-known/openid-configuration).
 */

export { createOauthRouter, discoveryHandler } from '../routes.oauth.ts';