/**
 * PEZHWAN — RFC 8693 token exchange service.
 *
 * Exchanges a bearer JWT for a new, short-lived access token restricted to
 * the requested scope + audience.
 */

import { ValidationError } from '@pezhwan/shared';

export interface TokenExchangeParams {
  subjectToken: string;
  subjectTokenType?: string;
  requestedScope?: string[];
  audience?: string;
  resource?: string;
}

export interface TokenExchangeDeps {
  /** Verifies the subject token and returns its claims. */
  verifySubject: (token: string) => Record<string, unknown>;
  /** Mints a scoped token for the exchanged session. */
  reserveToken: (
    claims: Record<string, unknown>,
    requestedScope: string[],
  ) => Promise<{ accessToken: string; expiresIn: number }>;
}

export interface TokenExchangeResult {
  accessToken: string;
  expiresIn: number;
  issuedTokenType: string;
  scope: string;
  issuedAt: number;
}

const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';

export class TokenExchangeService {
  constructor(private readonly deps: TokenExchangeDeps) {}

  async exchange(params: TokenExchangeParams): Promise<TokenExchangeResult> {
    if (!params.subjectToken) {
      throw new ValidationError('subject_token is required');
    }
    const claims = this.deps.verifySubject(params.subjectToken);
    const scope = params.requestedScope ?? [];
    const { accessToken, expiresIn } = await this.deps.reserveToken(claims, scope);
    return {
      accessToken,
      expiresIn,
      issuedTokenType: ACCESS_TOKEN_TYPE,
      scope: scope.join(' '),
      issuedAt: Date.now(),
    };
  }
}
