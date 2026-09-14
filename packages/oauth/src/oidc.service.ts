/**
 * PEZHWAN — OIDC helpers: discovery metadata, JWKS, id_token verification.
 */

import { createPublicKey } from 'node:crypto';
import { verifyJwt } from '@pezhwan/crypto';

export interface IdTokenClaims {
  iss?: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  auth_time?: number;
  nonce?: string;
  azp?: string;
  [key: string]: unknown;
}

export interface IdTokenHeader {
  kid?: string;
  alg?: string;
}

/** Decodes (does not verify) an id_token into header and claims. */
export function decodeIdToken(token: string): {
  header: IdTokenHeader;
  claims: IdTokenClaims;
} {
  const [headerPart, payloadPart] = token.split('.');
  if (!headerPart || !payloadPart) {
    throw new Error('Malformed id_token');
  }
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8')) as IdTokenHeader;
  const claims = JSON.parse(
    Buffer.from(payloadPart, 'base64url').toString('utf8'),
  ) as IdTokenClaims;
  return { header, claims };
}

/** Minimal JWK shape accepted by node's key importer. */
export interface JwkLike {
  kty: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

/** Converts an RSA/EC JWK to a PEM SPKI public key. */
export function jwkToPem(jwk: JwkLike): string {
  const key = createPublicKey({
    key: { ...jwk },
    format: 'jwk',
  } as Parameters<typeof createPublicKey>[0]);
  return key.export({ type: 'spki', format: 'pem' }) as string;
}

export interface VerifyIdTokenOptions {
  issuer: string;
  audience: string | string[];
  nonce?: string;
  /** Resolves the PEM public key for a given kid (e.g. from a JWKS URI). */
  jwksProvider: (kid?: string) => Promise<string>;
  leewayMs?: number;
}

/** Fully verifies signature, issuer, audience, expiry and nonce. */
export async function verifyIdToken(
  token: string,
  options: VerifyIdTokenOptions,
): Promise<IdTokenClaims> {
  const { header, claims } = decodeIdToken(token);
  if (claims.iss !== options.issuer) {
    throw new Error('id_token issuer mismatch');
  }
  const allowedAudiences = Array.isArray(options.audience) ? options.audience : [options.audience];
  const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [String(claims.aud)];
  if (!tokenAudiences.some((aud) => allowedAudiences.includes(aud))) {
    throw new Error('id_token audience mismatch');
  }
  const pem = await options.jwksProvider(header.kid);
  const algorithm = (header.alg ?? 'RS256') as Parameters<typeof verifyJwt>[2];
  const verified = verifyJwt(token, pem, algorithm);
  const claims2 = { ...claims, ...(verified as Record<string, unknown>) } as IdTokenClaims;
  const leewaySeconds = Math.floor((options.leewayMs ?? 60_000) / 1000);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (claims2.exp < nowSeconds - leewaySeconds) {
    throw new Error('id_token expired');
  }
  if (options.nonce && claims2.nonce !== options.nonce) {
    throw new Error('id_token nonce mismatch');
  }
  return claims2;
}

/** Standard OIDC discovery document generator. */
export function buildDiscoveryMetadata(options: {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint?: string;
  supportedScopes?: string[];
}): Record<string, unknown> {
  return {
    issuer: options.issuer,
    authorization_endpoint: options.authorizationEndpoint,
    token_endpoint: options.tokenEndpoint,
    jwks_uri: options.jwksUri,
    userinfo_endpoint: options.userinfoEndpoint,
    response_types_supported: ['code'],
    response_modes_supported: ['query', 'form_post'],
    grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256', 'ES256', 'EdDSA'],
    scopes_supported: options.supportedScopes ?? [
      'openid',
      'profile',
      'email',
      'phone',
      'offline_access',
    ],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
  };
}

/** Builds a JWKS document from public JWK + metadata pairs. */
export function buildJwks(
  keys: Array<{ kid: string; alg?: string; use?: string; jwk: JwkLike }>,
): Record<string, unknown> {
  return {
    keys: keys.map(({ kid, alg, use, jwk }) => ({
      kid,
      alg: alg ?? 'RS256',
      use: use ?? 'sig',
      kty: jwk.kty,
      n: 'n' in jwk ? jwk.n : undefined,
      e: 'e' in jwk ? jwk.e : undefined,
      crv: 'crv' in jwk ? jwk.crv : undefined,
      x: 'x' in jwk ? jwk.x : undefined,
      y: 'y' in jwk ? jwk.y : undefined,
    })),
  };
}
