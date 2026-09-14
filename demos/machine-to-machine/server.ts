import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import mongoose from 'mongoose';
import {
  createPezhwan,
  initKeyPersistence,
  OAuthClientModel,
  type PezhwanRuntime,
} from '@pezhwan/core';
import {
  createAuthenticate,
  createAuthenticateApiKey,
  requireAuth,
  requireApiKey,
  type PezhwanRequest,
} from '@pezhwan/express';

const PORT = Number(process.env.PORT ?? 5182);
const TENANT_ID = process.env.TENANT_ID ?? 'dev-tenant';
const APPLICATION_ID = process.env.APPLICATION_ID ?? 'dev-app';
const ISSUER = process.env.ISSUER ?? 'http://localhost:4011';
const AUDIENCE = 'pezhwan.clients';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
const MFA_ENC_KEY =
  process.env.MFA_ENCRYPTION_KEY ?? 'cGV6aHdhbi1kZW1vLW1mYS1rZXktMDEyMzQ1Njc4OWE=';

await mongoose.connect(MONGODB_URI);
console.log('[m2m] connected to MongoDB');

const runtime: PezhwanRuntime = createPezhwan({
  tenantId: TENANT_ID,
  applicationId: APPLICATION_ID,
  issuer: ISSUER,
  audience: AUDIENCE,
  mfaEncryptionKey: MFA_ENC_KEY,
  otpDelivery: {
    sendEmail: async (target: string, code: string) => {
      console.log(`\n[m2m] OTP to ${target}: ${code}\n`);
    },
  },
});

await initKeyPersistence(runtime, { directory: path.resolve(__dirname, 'keys') });
console.log(`[m2m] signing keys ready`);

// ---------------------------------------------------------------------------
// In-memory state for API keys (rawKey is shown once; only hash is in Mongo)
// ---------------------------------------------------------------------------

interface TrackedApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rawKey: string;
  createdAt: string;
}

const trackedKeys: TrackedApiKey[] = [];

// OAuth client credentials cache (secrets cannot be retrieved after creation)
const oauthClientSecrets = new Map<string, string>();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '.')));

const h =
  (fn: (req: PezhwanRequest, res: express.Response) => Promise<unknown>) =>
  (req: PezhwanRequest, res: express.Response): void => {
    fn(req, res).then(
      (data) => res.json({ success: true, data }),
      (err: { code?: string; message?: string; status?: number }) => {
        const status = err.status ?? (err.code ? 400 : 500);
        console.error(`[m2m] ${req.method} ${req.path} failed:`, err);
        res.status(status).json({
          success: false,
          error: { code: err.code ?? 'ERROR', message: err.message ?? 'Unexpected error' },
        });
      },
    );
  };

// ---------------------------------------------------------------------------
// API Key management routes
// ---------------------------------------------------------------------------

app.post(
  '/api/keys/create',
  h(async (req) => {
    const { name, scopes } = req.body ?? {};
    if (!name) {
      const err = new Error('name is required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await runtime.apiKeys.create({
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
      name,
      scopes: scopes ?? ['machine.read'],
    });
    const entry: TrackedApiKey = {
      id: `pending-${Date.now()}`,
      name,
      prefix: result.prefix,
      scopes: scopes ?? ['machine.read'],
      rawKey: result.rawKey,
      createdAt: new Date().toISOString(),
    };
    trackedKeys.push(entry);

    // Look up the created key to get the real ID
    const { ApiKeyModel } = await import('@pezhwan/core');
    const doc = await ApiKeyModel.findOne({
      keyHash: result.keyHash,
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
    }).lean();
    if (doc) entry.id = String(doc._id);

    return {
      name,
      rawKey: result.rawKey,
      prefix: result.prefix,
      warning: 'Store the raw key now — it cannot be retrieved again.',
    };
  }),
);

app.get(
  '/api/keys',
  h(async () => {
    return trackedKeys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.prefix,
      scopes: k.scopes,
      createdAt: k.createdAt,
    }));
  }),
);

app.post(
  '/api/keys/:name/revoke',
  h(async (req) => {
    const key = trackedKeys.find((k) => k.name === req.params.name);
    if (!key) {
      const err = new Error('Key not found') as Error & { code: string; status: number };
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }
    await runtime.apiKeys.revoke(key.id);
    const idx = trackedKeys.indexOf(key);
    if (idx !== -1) trackedKeys.splice(idx, 1);
    return { revoked: true };
  }),
);

// ---------------------------------------------------------------------------
// OAuth client registration + client_credentials exchange
// ---------------------------------------------------------------------------

app.post(
  '/api/oauth/register',
  h(async () => {
    const CLIENT_NAME = 'Demo Service Client';

    // Always issue a FRESH client so the one-time secret stays showable across
    // restarts (this is a demo — code never stashes secrets for re-display).
    await OAuthClientModel.deleteMany({
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
      name: CLIENT_NAME,
    });
    oauthClientSecrets.clear();

    const result = await runtime.oauth.registerClient({
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
      name: CLIENT_NAME,
      redirectUris: [],
      grants: ['client_credentials'],
      scopes: ['machine.read'],
      confidential: true,
    });
    if (result.clientSecret) {
      oauthClientSecrets.set(result.clientId, result.clientSecret);
    }
    return { clientId: result.clientId, clientSecret: result.clientSecret };
  }),
);

app.post(
  '/api/oauth/token',
  h(async (req) => {
    const { clientId, clientSecret } = req.body ?? {};
    if (!clientId || !clientSecret) {
      const err = new Error('clientId and clientSecret are required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await runtime.oauth.exchange({
      grantType: 'client_credentials',
      clientId,
      clientSecret,
      scope: 'machine.read',
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
    });
    // Verify server-side (proves the token is valid)
    const decoded = runtime.tokens.verifyAccessToken(result.accessToken);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      scope: result.scope,
      decoded: {
        sub: decoded.userId,
        roles: decoded.roles,
        scope: decoded.scope,
        authMethod: decoded.authMethod,
      },
    };
  }),
);

// ---------------------------------------------------------------------------
// Protected service routes
// ---------------------------------------------------------------------------

// Ping: requires an API key
app.get(
  '/api/service/ping',
  createAuthenticateApiKey(runtime),
  requireApiKey(),
  h(async (req) => ({
    ok: true,
    authMethod: req.pezhwan!.authMethod,
    permissions: req.pezhwan!.permissions,
    message: `authenticated via API key — scopes: ${req.pezhwan!.permissions.join(', ')}`,
  })),
);

// Status: accepts API key OR Bearer token (client_credentials)
app.get(
  '/api/service/status',
  createAuthenticateApiKey(runtime),
  createAuthenticate(runtime),
  requireAuth(),
  h(async (req) => ({
    ok: true,
    sub: req.pezhwan!.userId,
    roles: req.pezhwan!.roles,
    scope: req.pezhwan!.scope,
    authMethod: req.pezhwan!.authMethod,
  })),
);

// Health (unauthenticated)
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`[m2m] demo listening on http://localhost:${PORT}`);
  console.log(`[m2m] tenant ${TENANT_ID} · application ${APPLICATION_ID}`);
});
