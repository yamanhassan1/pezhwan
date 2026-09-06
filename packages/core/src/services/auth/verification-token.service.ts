/**
 * PEZHWAN — Verification token service (auth facade).
 *
 * Re-exports the canonical verification-token service.
 */
export * from '../verificationToken.service.ts';

export { IssueTokenInput, RedeemResult, VerificationTokenService } from '../verificationToken.service.ts';