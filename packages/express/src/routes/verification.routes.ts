/**
 * PEZHWAN — verification router facade.
 *
 * Modular mirror of ./routes.extra.ts. Mount at /v1/verification
 * (/password/forgot /password/reset/confirm /email/verify-token
 *  /magic/send /magic/redeem).
 */

export { createVerificationRouter } from '../routes.extra.ts';
