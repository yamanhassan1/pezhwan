/**
 * PEZHWAN — token service.
 *
 * Access tokens: short-lived RS256 JWTs signed with the KeyStore's current key
 * (kid embedded for rotation). A token's payload is minimal and explicit:
 * sub/tenantId/applicationId/sessionId + roles/permissions. No PII.
 *
 * Refresh tokens: high-entropy opaque random strings. Only the SHA-256 hash is
 * ever stored (session doc, Redis cache). Raw refresh tokens are presented by
 * the client on `/auth/refresh` and immediately rotated (one-time use).
 */

import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { TokenError } from '@pezhwan/shared';
import type {
  AuthMethod,
  IdentityContext,
  JwtAlgorithm,
  TokenClaims,
} from '@pezhwan/shared';
import { signJwt, verifyJwt, type KeyStore } from '@pezhwan/crypto';
import type { RedisCache } from './redisCache.ts';

export interface TokenServiceOptions {
  issuer: string;
  audience: string;
  accessTokenTtlMs: number;
  refreshTokenTtlMs: number;
  algorithm: JwtAlgorithm;
  store: KeyStore;
  cache: RedisCache;
}

export interface TokenPair {
  /** Raw opaque refresh-token string (shown to the client once). */
  refreshToken: string;
  /** SHA-256 hash of the refresh token (what we persist). */
  refreshTokenHash: string;
}

export class TokenService {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTokenTtlMs: number;
  private readonly refreshTokenTtlMs: number;
  private readonly algorithm: JwtAlgorithm;
  private readonly store: KeyStore;
  private readonly cache: RedisCache;

  constructor(options: TokenServiceOptions) {
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.accessTokenTtlMs = options.accessTokenTtlMs;
    this.refreshTokenTtlMs = options.refreshTokenTtlMs;
    this.algorithm = options.algorithm;
    this.store = options.store;
    this.cache = options.cache;
  }

  /** Current access-token lifetime (ms) — exposed for OAuth expiry meta. */
  get accessTokenTtl(): number {
    return this.accessTokenTtlMs;
  }

  /** Sign a short-lived access token carrying a minimal identity. */
  signAccessToken(
    context: Omit<IdentityContext, 'authenticatedAt'> & {
      scope?: string;
      clientId?: string;
      tokenVersion?: number;
    },
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const key = this.store.current;
    const claims: TokenClaims = {
      sub: context.userId,
      tenantId: context.tenantId,
      applicationId: context.applicationId,
      sessionId: context.sessionId,
      roles: context.roles,
      permissions: context.permissions,
      authMethod: context.authMethod,
      kid: key.kid,
      iss: this.issuer,
      aud: this.audience,
      iat: now,
      exp: now + Math.floor(this.accessTokenTtlMs / 1000),
      jti: randomBytes(16).toString('hex'),
      scope: context.scope,
      clientId: context.clientId,
      tokenVersion: context.tokenVersion,
    };
    return signJwt(
      claims as unknown as Record<string, unknown>,
      key.privateKey,
      key.kid,
      this.algorithm,
      { algorithm: this.algorithm as jwt.Algorithm },
    );
  }

  /**
   * Sign an OIDC ID token (openid scope). Binds the `nonce` from the
   * authorization request so the RP can validate it against the session.
   */
  signIdToken(input: {
    userId: string;
    tenantId: string;
    applicationId: string;
    sessionId: string;
    nonce: string | null;
    scope: string;
    clientId: string;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    const key = this.store.current;
    const claims: Record<string, unknown> = {
      iss: this.issuer,
      sub: input.userId,
      aud: input.clientId,
      iat: now,
      exp: now + Math.floor(this.accessTokenTtlMs / 1000),
      auth_time: now,
      nonce: input.nonce ?? undefined,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      sessionId: input.sessionId,
    };
    if (input.scope.split(/\s+/).includes('email')) {
      // Email claim is resolved by the caller (needs a User lookup); left
      // undefined here so the caller may spread additional claims.
    }
    return signJwt(
      claims,
      key.privateKey,
      key.kid,
      this.algorithm,
      { algorithm: this.algorithm as jwt.Algorithm },
    );
  }

  /** Verify an access token against the signing key denoted by its kid. */
  verifyAccessToken(token: string): IdentityContext {
    let header: { kid?: string };
    try {
      const [encodedHeader] = token.split('.');
      if (!encodedHeader) {
        throw new Error('malformed token');
      }
      header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString('utf-8'),
      );
    } catch {
      throw new TokenError('Malformed access token', 'INVALID_JWT');
    }

    const key = header.kid ? this.store.byKid(header.kid) : this.store.current;
    if (!key) {
      throw new TokenError('Unknown signing key', 'UNKNOWN_KEY', {
        details: { kid: header.kid },
      });
    }

    let claims: TokenClaims;
    try {
      claims = verifyJwt(token, key.publicKey, this.algorithm, {
        issuer: this.issuer,
        audience: this.audience,
        maxAge: Math.floor(this.accessTokenTtlMs / 1000),
      }) as unknown as TokenClaims;
    } catch (err) {
      const reason =
        err instanceof TokenError
          ? err.code
          : (err as Error).name === 'TokenExpiredError'
            ? 'TOKEN_EXPIRED'
            : 'INVALID_SIGNATURE';
      throw new TokenError('Invalid access token', reason);
    }

    // Reject hollow tokens: a valid identity requires the mandatory, non-empty
    // claims. Defense-in-depth — even a correctly-signed token missing these
    // must never yield an empty/half-formed IdentityContext.
    const required: Array<[string, unknown]> = [
      ['sub', claims.sub],
      ['tenantId', claims.tenantId],
      ['applicationId', claims.applicationId],
      ['sessionId', claims.sessionId],
    ];
    for (const [name, value] of required) {
      if (typeof value !== 'string' || (value as string).length === 0) {
        throw new TokenError('Access token missing required claim', 'INVALID_JWT', {
          details: { claim: name },
        });
      }
    }
    if (typeof claims.iat !== 'number') {
      throw new TokenError('Access token missing iat claim', 'INVALID_JWT');
    }

    return {
      userId: claims.sub,
      tenantId: claims.tenantId,
      applicationId: claims.applicationId,
      sessionId: claims.sessionId,
      roles: claims.roles ?? [],
      permissions: claims.permissions ?? [],
      authMethod: (claims.authMethod ?? 'password') as AuthMethod,
      authenticatedAt: claims.iat * 1000,
      tokenVersion: claims.tokenVersion,
      scope: claims.scope,
      clientId: claims.clientId,
    };
  }

  /** Generate an opaque refresh token (raw string + SHA-256 hash). */
  createRefreshToken(): TokenPair {
    const raw = randomBytes(48).toString('base64url');
    const hash = this.hashRefreshToken(raw);
    return { refreshToken: raw, refreshTokenHash: hash };
  }

  hashRefreshToken(raw: string): string {
    return createHash('sha256').update(raw).digest('base64');
  }

  /** Constant-time hash comparison for the presented refresh token. */
  matchesHash(raw: string, hash: string): boolean {
    const a = Buffer.from(this.hashRefreshToken(raw), 'base64');
    let b: Buffer;
    try {
      b = Buffer.from(hash, 'base64');
    } catch {
      return false;
    }
    return a.length === b.length && timingSafeEqual(a, b);
  }
}