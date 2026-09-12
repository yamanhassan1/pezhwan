/**
 * PEZHWAN — single sign-on (SSO) types.
 */

/** Identity providers Pezhwan can federate with. */
export type SsoProviderName = 'saml' | 'oidc' | 'google' | 'github' | 'apple' | 'microsoft';

/** Provider-neutral SSO configuration. */
export interface SsoProviderConfig {
  provider: SsoProviderName;
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  issuer?: string;
  metadataUrl?: string;
  attributeMapping: Record<string, string>;
}

/** Normalized profile returned after an SSO exchange. */
export interface SsoProfile {
  provider: SsoProviderName;
  subject: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
  /** Raw provider claims (audited, never trusted for authz). */
  raw: Record<string, unknown>;
}

/** Result of linking an SSO identity to a local account. */
export interface SsoLinkResult {
  linked: boolean;
  userId: string;
  identityId?: string;
}
