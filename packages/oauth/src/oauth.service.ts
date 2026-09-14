/**
 * PEZHWAN — OAuth engine (authorization-code + client-credentials).
 *
 * Composes the code manager and PKCE to implement the OAuth 2.1 token
 * endpoint contract. Token issuance is delegated to an injectable callback so
 * the engine stays storage/keystore agnostic. Built on top of the core
 * session/token services by adapters.
 */

import type { AuthMethod } from '@pezhwan/shared';
import { AuthorizationError, TokenError, ValidationError } from '@pezhwan/shared';
import { sha256Hex } from '@pezhwan/shared';
import { AuthorizationCodeManager } from './authorization-code.ts';
import { verifyPkce } from './pkce.ts';

/** Minimal client record the engine validates against. */
export interface OAuthClientRecord {
  clientId: string;
  redirectUris: string[];
  isConfidential: boolean;
  /** SHA-256 of the client secret (null for public clients). */
  clientSecretHash: string | null;
  isActive: boolean;
}

/** Tokens minted by the issuer after a successful grant. */
export interface OAuthTokenSet {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

export interface OAuthServiceDeps {
  codes: AuthorizationCodeManager;
  loadClient: (clientId: string) => Promise<OAuthClientRecord | null>;
  issueTokens: (ctx: {
    userId: string;
    tenantId: string;
    applicationId: string;
    sessionId: string | null;
    authMethod: AuthMethod;
    scope: string[];
    clientId?: string;
  }) => Promise<OAuthTokenSet>;
}

export interface TokenResponse extends OAuthTokenSet {
  tokenType: 'Bearer';
  scope: string;
}

export interface IssueCodeParams {
  tenantId: string;
  applicationId: string;
  clientId: string;
  userId: string;
  sessionId: string;
  redirectUri: string;
  scope: string[];
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  authMethod: AuthMethod;
}

export interface TokenRequest {
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  code?: string;
  codeVerifier?: string;
  /** client_credentials: requested scope. */
  scope?: string[];
}

const CLIENT_AUTH_FAILED = 'CLIENT_AUTHENTICATION_FAILED';

export class OAuthService {
  constructor(private readonly deps: OAuthServiceDeps) {}

  private async requireActiveClient(clientId: string): Promise<OAuthClientRecord> {
    const client = await this.deps.loadClient(clientId);
    if (!client) {
      throw new TokenError('Unknown OAuth client', 'UNKNOWN_CLIENT');
    }
    if (!client.isActive) {
      throw new TokenError('OAuth client is disabled', 'CLIENT_DISABLED');
    }
    return client;
  }

  private authenticateClient(client: OAuthClientRecord, clientSecret: string | undefined): void {
    if (!client.isConfidential) {
      return;
    }
    if (!client.clientSecretHash || !clientSecret) {
      throw new AuthorizationError('Client authentication failed', CLIENT_AUTH_FAILED);
    }
    if (sha256Hex(clientSecret) !== client.clientSecretHash) {
      throw new AuthorizationError('Client authentication failed', CLIENT_AUTH_FAILED);
    }
  }

  /** authorize endpoint: validate the client + redirect URI and issue a code. */
  async issueCode(params: IssueCodeParams): Promise<{
    code: string;
    redirectUri: string;
    state?: string;
  }> {
    const client = await this.requireActiveClient(params.clientId);
    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new ValidationError('Redirect URI mismatch', 'OAUTH_REDIRECT_URI_MISMATCH');
    }
    const { code } = await this.deps.codes.issue({
      tenantId: params.tenantId,
      applicationId: params.applicationId,
      clientId: params.clientId,
      userId: params.userId,
      sessionId: params.sessionId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      codeChallenge: params.codeChallenge,
      codeChallengeMethod: params.codeChallengeMethod ?? null,
      nonce: params.nonce ?? null,
      authMethod: params.authMethod,
    });
    return { code, redirectUri: params.redirectUri, state: params.state };
  }

  /** token endpoint: authorization_code grant with PKCE. */
  async exchangeAuthorizationCode(
    request: Required<Pick<TokenRequest, 'clientId' | 'redirectUri' | 'code'>> &
      Pick<TokenRequest, 'clientSecret' | 'codeVerifier'>,
  ): Promise<TokenResponse> {
    const client = await this.requireActiveClient(request.clientId);
    this.authenticateClient(client, request.clientSecret);
    if (!client.redirectUris.includes(request.redirectUri)) {
      throw new TokenError('Redirect URI mismatch', 'OAUTH_REDIRECT_URI_MISMATCH');
    }

    const record = await this.deps.codes.redeem(request.code);
    if (!record) {
      throw new TokenError('Invalid authorization code', 'INVALID_AUTHORIZATION_CODE');
    }
    if (record.redirectUri !== request.redirectUri) {
      throw new TokenError('Redirect URI mismatch', 'OAUTH_REDIRECT_URI_MISMATCH');
    }
    if (
      record.codeChallenge &&
      !verifyPkce(request.codeVerifier ?? '', record.codeChallenge, record.codeChallengeMethod)
    ) {
      throw new TokenError('PKCE verification failed', 'PKCE_VERIFICATION_FAILED');
    }

    const tokens = await this.deps.issueTokens({
      userId: record.userId,
      tenantId: record.tenantId,
      applicationId: record.applicationId,
      sessionId: record.sessionId,
      authMethod: record.authMethod,
      scope: record.scope,
      clientId: record.clientId,
    });
    return { tokenType: 'Bearer', ...tokens, scope: record.scope.join(' ') };
  }

  /** token endpoint: client_credentials grant (service accounts / API keys). */
  async clientCredentials(
    request: Required<Pick<TokenRequest, 'clientId'>> &
      Pick<TokenRequest, 'clientSecret' | 'scope'>,
  ): Promise<TokenResponse> {
    const client = await this.requireActiveClient(request.clientId);
    if (!client.isConfidential) {
      throw new AuthorizationError(
        'Public clients cannot use client_credentials',
        CLIENT_AUTH_FAILED,
      );
    }
    this.authenticateClient(client, request.clientSecret);
    const scope = request.scope ?? ['service'];
    const tokens = await this.deps.issueTokens({
      userId: client.clientId,
      tenantId: 'system',
      applicationId: 'system',
      sessionId: null,
      authMethod: 'service',
      scope,
      clientId: client.clientId,
    });
    return { tokenType: 'Bearer', ...tokens, scope: scope.join(' ') };
  }
}
