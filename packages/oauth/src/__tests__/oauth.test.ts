import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  OAuthService,
  type OAuthClientRecord,
  type OAuthTokenSet,
} from '@pezhwan/oauth';
import {
  AuthorizationCodeManager,
  MemoryAuthorizationCodeStore,
  generateCodeChallenge,
  generateCodeVerifier,
} from '@pezhwan/oauth';
import { sha256Hex } from '@pezhwan/shared';
import { TokenError, ValidationError, AuthorizationError } from '@pezhwan/shared';

function buildEngine(_overrides: Partial<Record<string, unknown>> = {}) {
  const store = new MemoryAuthorizationCodeStore();
  const codes = new AuthorizationCodeManager(store);
  const records = new Map<string, OAuthClientRecord>();
  records.set('confidential', {
    clientId: 'confidential',
    redirectUris: ['https://app.example.com/cb'],
    isConfidential: true,
    clientSecretHash: sha256Hex('secret-value'),
    isActive: true,
  });
  records.set('public', {
    clientId: 'public',
    redirectUris: ['https://app.example.com/cb'],
    isConfidential: false,
    clientSecretHash: null,
    isActive: true,
  });
  const issued: string[] = [];
  const issueTokens = async (ctx: { userId: string; authMethod: string; scope: string[] }): Promise<OAuthTokenSet> => {
    issued.push(ctx.authMethod);
    return { accessToken: 'access.' + ctx.userId, expiresIn: 900 };
  };
  const engine = new OAuthService({
    codes,
    loadClient: async (clientId: string) => records.get(clientId) ?? null,
    issueTokens,
  } as never);
  return { engine, store, issued, records };
}

describe('OAuthService authorization-code flow', () => {
  it('issues a code and exchanges it with PKCE', async () => {
    const { engine, issued } = buildEngine();
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier, 'S256');
    const { code, redirectUri } = await engine.issueCode({
      tenantId: 't1',
      applicationId: 'a1',
      clientId: 'public',
      userId: 'u1',
      sessionId: 's1',
      redirectUri: 'https://app.example.com/cb',
      scope: ['openid', 'email'],
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      authMethod: 'oauth',
    });
    const tokens = await engine.exchangeAuthorizationCode({
      clientId: 'public',
      redirectUri,
      code,
      codeVerifier: verifier,
    });
    assert.equal(tokens.accessToken, 'access.u1');
    assert.equal(tokens.tokenType, 'Bearer');
    assert.equal(tokens.scope, 'openid email');
    assert.deepEqual(issued, ['oauth']);
  });

  it('rejects a code exchange with the wrong verifier', async () => {
    const { engine } = buildEngine();
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier, 'S256');
    const { code, redirectUri } = await engine.issueCode({
      tenantId: 't1',
      applicationId: 'a1',
      clientId: 'public',
      userId: 'u1',
      sessionId: 's1',
      redirectUri: 'https://app.example.com/cb',
      scope: ['openid'],
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      authMethod: 'oauth',
    });
    await assert.rejects(
      engine.exchangeAuthorizationCode({
        clientId: 'public',
        redirectUri,
        code,
        codeVerifier: 'wrong-verifier-123456',
      }),
      (err: unknown) => err instanceof TokenError,
    );
  });

  it('rejects a reused code', async () => {
    const { engine } = buildEngine();
    const { code, redirectUri } = await engine.issueCode({
      tenantId: 't1',
      applicationId: 'a1',
      clientId: 'public',
      userId: 'u1',
      sessionId: 's1',
      redirectUri: 'https://app.example.com/cb',
      scope: ['openid'],
      authMethod: 'oauth',
    });
    await engine.exchangeAuthorizationCode({ clientId: 'public', redirectUri, code });
    await assert.rejects(
      engine.exchangeAuthorizationCode({ clientId: 'public', redirectUri, code }),
      (err: unknown) => err instanceof TokenError,
    );
  });

  it('rejects a redirect-uri mismatch at authorize time', async () => {
    const { engine } = buildEngine();
    await assert.rejects(
      engine.issueCode({
        tenantId: 't1',
        applicationId: 'a1',
        clientId: 'public',
        userId: 'u1',
        sessionId: 's1',
        redirectUri: 'https://evil.example.com/cb',
        scope: ['openid'],
        authMethod: 'oauth',
      }),
      (err: unknown) => err instanceof ValidationError,
    );
  });

  it('authenticates confidential clients', async () => {
    const { engine } = buildEngine();
    const { code, redirectUri } = await engine.issueCode({
      tenantId: 't1',
      applicationId: 'a1',
      clientId: 'confidential',
      userId: 'u1',
      sessionId: 's1',
      redirectUri: 'https://app.example.com/cb',
      scope: ['openid'],
      authMethod: 'oauth',
    });
    await assert.rejects(
      engine.exchangeAuthorizationCode({ clientId: 'confidential', redirectUri, code }),
      (err: unknown) => err instanceof AuthorizationError,
    );
    const ok = await engine.exchangeAuthorizationCode({
      clientId: 'confidential',
      redirectUri,
      code,
      clientSecret: 'secret-value',
    });
    assert.ok(ok.accessToken.length > 0);
  });
});

describe('OAuthService client_credentials', () => {
  it('mints a service token for authenticated confidential clients', async () => {
    const { engine, issued } = buildEngine();
    const tokens = await engine.clientCredentials({
      clientId: 'confidential',
      clientSecret: 'secret-value',
      scope: ['capability:read'],
    });
    assert.equal(tokens.accessToken, 'access.confidential');
    assert.deepEqual(issued, ['service']);
  });

  it('rejects public clients', async () => {
    const { engine } = buildEngine();
    await assert.rejects(
      engine.clientCredentials({ clientId: 'public' }),
      (err: unknown) => err instanceof AuthorizationError,
    );
  });

  it('rejects a wrong secret', async () => {
    const { engine } = buildEngine();
    await assert.rejects(
      engine.clientCredentials({ clientId: 'confidential', clientSecret: 'nope' }),
      (err: unknown) => err instanceof AuthorizationError,
    );
  });
});
