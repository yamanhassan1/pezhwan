/**
 * PEZHWAN — OAuth provider adapter contract.
 *
 * A provider adapter models one external identity provider (Google, Apple,
 * GitHub, Microsoft, enterprise IdP, ...). Core auth NEVER hard-codes a
 * provider — the AuthEngine consumes this interface, so new providers are
 * added by providing an adapter, not by touching the auth engine.
 */

/** A verified profile returned by a provider after a successful exchange. */
export interface ProviderProfile {
  /** Provider's stable subject id for this user (sub). */
  subject: string;
  /** Verified email address, if the provider authorizes it. */
  email?: string;
  /** Whether the provider has verified the email. */
  emailVerified?: boolean;
  /** Display name / full name. */
  name?: string;
  /** Profile picture URL. */
  picture?: string;
  /** Any provider-specific raw claims. */
  raw?: Record<string, unknown>;
}

/** Parameters the core supplies when building an authorization URL. */
export interface BuildAuthUrlParams {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce?: string;
  scope?: string;
  prompt?: string;
}

/** Input to exchange an authorization code for tokens. */
export interface ExchangeParams {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  code: string;
  codeVerifier?: string;
}

/** The result of an authorization-code exchange. */
export interface ExchangeResult {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  raw?: Record<string, unknown>;
}

/**
 * One external identity provider. Implementations are pure (no shared mutable
 * state) and may be used directly or composed into a registry.
 */
export interface OAuthProviderAdapter {
  readonly name: string;
  buildAuthorizationUrl(params: BuildAuthUrlParams): string;
  exchange(params: ExchangeParams): Promise<ExchangeResult>;
  /** Resolve a user profile from the exchanged access/id token. */
  getProfile(
    accessToken: string,
    idToken?: string,
  ): Promise<ProviderProfile>;
}