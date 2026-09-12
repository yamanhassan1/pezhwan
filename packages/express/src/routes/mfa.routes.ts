/**
 * PEZHWAN — MFA router facade.
 *
 * Modular mirror of ./routes.extra.ts. Mount at /v1/mfa
 * (/setup /enable /verify /disable /login).
 */

export { createMfaRouter } from '../routes.extra.ts';