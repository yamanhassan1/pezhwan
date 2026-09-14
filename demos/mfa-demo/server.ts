import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import express from 'express';
import mongoose from 'mongoose';
import { createPezhwan, initKeyPersistence, type PezhwanRuntime } from '@pezhwan/core';
import { createAuthenticate, requireAuth, type PezhwanRequest } from '@pezhwan/express';

const PORT = Number(process.env.PORT ?? 5177);
const TENANT_ID = process.env.TENANT_ID ?? 'dev-tenant';
const APPLICATION_ID = process.env.APPLICATION_ID ?? 'dev-app';
const ISSUER = process.env.ISSUER ?? 'http://localhost:4011';
const AUDIENCE = 'pezhwan.clients';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
// 32 bytes: must decode to exactly 32 bytes for AES-256-GCM (MfaService throws
// INVALID_MFA_ENCRYPTION_KEY otherwise). Override via MFA_ENCRYPTION_KEY in .env.
const MFA_ENC_KEY =
  process.env.MFA_ENCRYPTION_KEY ?? 'cGV6aHdhbi1kZW1vLW1mYS1rZXktMDEyMzQ1Njc4OWE=';

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
        res.status(status).json({
          success: false,
          error: {
            code: err.code ?? 'ERROR',
            message: err.message ?? 'Unexpected error',
          },
        });
      },
    );
  };

const auth = createAuthenticate(runtime);

// requireAuth() has already verified the bearer token; extract the userId or
// fail loudly (defensive: the identity is never trusted from the client).
const requireUserId = (req: PezhwanRequest): string => {
  const identity = req.pezhwan;
  if (!identity) {
    throw Object.assign(new Error('Authentication required'), {
      code: 'UNAUTHENTICATED',
      status: 401,
    });
  }
  return identity.userId;
};

// ---------------------------------------------------------------------------
// Password register / login (with the MFA gate)
// ---------------------------------------------------------------------------

app.post(
  '/api/register',
  h(async (req) => {
    const email = String(req.body?.email ?? '');
    const password = String(req.body?.password ?? '');
    const resp = await runtime.auth.register({
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
      email,
      password,
    });
    const user = resp.user;
    return {
      user: { id: String(user._id), email: user.email },
      tokens: resp.tokens,
    };
  }),
);

app.post(
  '/api/login',
  h(async (req) => {
    const email = String(req.body?.email ?? '');
    const password = String(req.body?.password ?? '');
    const resp = await runtime.auth.loginPassword({
      applicationId: APPLICATION_ID,
      email,
      password,
    });
    if (resp.mfaRequired) {
      return { mfaRequired: true, userId: resp.userId };
    }
    const user = resp.user;
    if (!user || !resp.tokens) {
      throw Object.assign(new Error('Login completed without tokens'), {
        code: 'LOGIN_NO_TOKENS',
      });
    }
    return {
      user: { id: String(user._id), email: user.email },
      tokens: resp.tokens,
    };
  }),
);

// Completes the challenged login once the TOTP code is verified.
app.post(
  '/api/mfa/complete-login',
  h(async (req) => {
    const userId = String(req.body?.userId ?? '');
    const code = String(req.body?.code ?? '');
    const resp = await runtime.auth.verifyMfaLogin({
      userId,
      applicationId: APPLICATION_ID,
      code,
    });
    const user = resp.user;
    return {
      user: { id: String(user._id), email: user.email },
      tokens: resp.tokens,
    };
  }),
);

// ---------------------------------------------------------------------------
// MFA enrollment (TOTP / Google Authenticator) — authenticated
// ---------------------------------------------------------------------------

app.post(
  '/api/mfa/setup',
  auth,
  requireAuth(),
  h(async (req) => {
    const result = await runtime.mfa.beginSetup(requireUserId(req));
    return result; // { secret, otpauthUri, backupCodes }
  }),
);

app.post(
  '/api/mfa/enable',
  auth,
  requireAuth(),
  h(async (req) => {
    const code = String(req.body?.code ?? '');
    await runtime.mfa.enable(requireUserId(req), code);
    return { enabled: true };
  }),
);

app.get(
  '/api/mfa/status',
  auth,
  requireAuth(),
  h(async (req) => {
    return { enabled: await runtime.mfa.isEnabled(requireUserId(req)) };
  }),
);

app.post(
  '/api/mfa/disable',
  auth,
  requireAuth(),
  h(async (req) => {
    const code = String(req.body?.code ?? '');
    await runtime.mfa.disable(requireUserId(req), code);
    return { disabled: true };
  }),
);

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

app.get(
  '/api/me',
  auth,
  requireAuth(),
  h(async (req) => {
    const identity = req.pezhwan;
    if (!identity) {
      throw Object.assign(new Error('Authentication required'), {
        code: 'UNAUTHENTICATED',
        status: 401,
      });
    }
    return {
      ...identity,
      mfaEnabled: await runtime.mfa.isEnabled(identity.userId),
    };
  }),
);

app.listen(PORT, () => console.log(`demo listening on http://localhost:${PORT}`));
