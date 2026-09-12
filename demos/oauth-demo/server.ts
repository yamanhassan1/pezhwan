import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import mongoose from 'mongoose';
import {
  createPezhwan,
  initKeyPersistence,
  OAuthClientModel,
  UserModel,
  type PezhwanRuntime,
} from '@pezhwan/core';
import {
  createAuthenticate,
  requireAuth,
  type PezhwanRequest,
} from '@pezhwan/express';

const PORT = Number(process.env.PORT ?? 5180);
const TENANT_ID = process.env.TENANT_ID ?? 'dev-tenant';
const APPLICATION_ID = process.env.APPLICATION_ID ?? 'dev-app';
const ISSUER = process.env.ISSUER ?? 'http://localhost:4011';
const AUDIENCE = 'pezhwan.clients';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
const MFA_ENC_KEY = process.env.MFA_ENCRYPTION_KEY ?? 'cGV6aHdhbi1kZW1vLW1mYS1rZXktMDEyMzQ1Njc4OWE=';

await mongoose.connect(MONGODB_URI);

const runtime: PezhwanRuntime = createPezhwan({
  tenantId: TENANT_ID,
  applicationId: APPLICATION_ID,
  issuer: ISSUER,
  audience: AUDIENCE,
  mfaEncryptionKey: MFA_ENC_KEY,
  otpDelivery: {
    sendEmail: async (target: string, code: string) => {
      console.log(`\n=== [demo email] To ${target}: code ${code} ===\n`);
    },
  },
});

await initKeyPersistence(runtime, { directory: path.resolve(__dirname, 'keys') });

const pending = new Map<string, { codeVerifier: string; clientId: string; token: string }>();

const indexHtml = path.resolve(__dirname, 'index.html');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const h = (fn: (req: PezhwanRequest, res: express.Response) => Promise<unknown>) => (
  req: PezhwanRequest,
  res: express.Response,
): void => {
  fn(req, res).then(
    (data) => res.json({ success: true, data }),
    (err: { code?: string; message?: string; status?: number }) => {
      const status = err.status ?? (err.code ? 400 : 500);
      res.status(status).json({ success: false, error: { code: err.code ?? 'ERROR', message: err.message ?? 'Unexpected error' } });
    },
  );
};

app.get('/callback', (_req, res) => { res.sendFile(indexHtml); });

app.post('/api/register', h(async (req) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) throw { code: 'MISSING_FIELDS', message: 'email and password required', status: 400 };
  const { user, tokens } = await runtime.auth.register({
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
    email: email.trim(),
    password,
  });
  return { user: { id: String(user._id), email: user.email ?? email.trim() }, tokens };
}));

app.post('/api/login', h(async (req) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) throw { code: 'MISSING_FIELDS', message: 'email and password required', status: 400 };
  const result = await runtime.auth.loginPassword({ applicationId: APPLICATION_ID, email: email.trim(), password });
  if (result.mfaRequired || !result.tokens) {
    throw { code: 'MFA_REQUIRED', message: 'MFA enabled — demo only supports password', status: 400 };
  }
  return {
    user: { id: String((result.user as { _id: unknown })._id ?? result.userId), email: result.user?.email ?? email.trim() },
    tokens: result.tokens,
  };
}));

app.get('/api/bootstrap', h(async () => {
  const existing = await OAuthClientModel.findOne({
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
    name: 'Demo Web Client',
  }).lean();
  if (existing) {
    return { clientId: String(existing.clientId), redirectUri: 'http://localhost:5180/callback' };
  }
  const { clientId } = await runtime.oauth.registerClient({
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
    name: 'Demo Web Client',
    redirectUris: ['http://localhost:5180/callback'],
    grants: ['authorization_code', 'refresh_token'],
    scopes: ['openid', 'profile', 'email'],
    confidential: false,
  });
  return { clientId, redirectUri: 'http://localhost:5180/callback' };
}));

app.post('/api/oauth/authorize', createAuthenticate(runtime), requireAuth(), h(async (req) => {
  const { clientId } = req.body as { clientId?: string };
  if (!clientId) throw { code: 'MISSING_FIELDS', message: 'clientId is required', status: 400 };

  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  const stateBuf = randomBytes(16).toString('hex');

  pending.set(stateBuf, { codeVerifier, clientId, token: req.headers.authorization ?? '' });

  const { code } = await runtime.oauth.authorizeCode({
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
    clientId,
    redirectUri: 'http://localhost:5180/callback',
    scope: 'openid profile email',
    state: stateBuf,
    userId: req.pezhwan!.userId,
    sessionId: req.pezhwan!.sessionId,
    codeChallenge,
    codeChallengeMethod: 'S256',
    authMethod: 'password',
  });

  return {
    authorizationUrl: `http://localhost:5180/callback?code=${encodeURIComponent(code)}&state=${stateBuf}`,
  };
}));

app.post('/api/oauth/token', h(async (req) => {
  const { code, state } = req.body as { code?: string; state?: string };
  if (!code || !state) throw { code: 'MISSING_FIELDS', message: 'code and state are required', status: 400 };
  const entry = pending.get(state);
  if (!entry) throw { code: 'UNKNOWN_STATE', message: 'Unknown or expired state parameter', status: 400 };
  pending.delete(state);
  const { codeVerifier, clientId } = entry;
  const result = await runtime.oauth.exchange({
    grantType: 'authorization_code',
    clientId,
    code,
    redirectUri: 'http://localhost:5180/callback',
    codeVerifier,
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
  });
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    scope: result.scope,
    expiresIn: result.expiresIn,
  };
}));

app.post('/api/oauth/refresh', h(async (req) => {
  const { refreshToken, clientId } = req.body as { refreshToken?: string; clientId?: string };
  if (!refreshToken || !clientId) throw { code: 'MISSING_FIELDS', message: 'refreshToken and clientId are required', status: 400 };
  const result = await runtime.oauth.exchange({
    grantType: 'refresh_token',
    clientId,
    refreshToken,
    tenantId: TENANT_ID,
    applicationId: APPLICATION_ID,
  });
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
    scope: result.scope,
  };
}));

app.get('/api/me', createAuthenticate(runtime), requireAuth(), h(async (req) => {
  const userId = req.pezhwan!.userId;
  const user = await UserModel.findById(userId).select('email').lean();
  return {
    ...req.pezhwan,
    email: user?.email ?? null,
  };
}));

app.get('/api/clients', createAuthenticate(runtime), requireAuth(), h(async () => {
  const clients = await OAuthClientModel.find({ tenantId: TENANT_ID, applicationId: APPLICATION_ID })
    .select('clientId name redirectUris grants scopes isConfidential isActive createdAt')
    .lean();
  return { clients };
}));

app.use(
  (err: { status?: number; code?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status ?? 500;
    res.status(status).json({ success: false, error: { code: err.code ?? 'ERROR', message: err.message ?? 'Unexpected error' } });
  },
);

app.listen(PORT, () => console.log(`oauth-demo listening on http://localhost:${PORT}`));