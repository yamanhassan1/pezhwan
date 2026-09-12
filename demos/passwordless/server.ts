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
  UserModel,
  type PezhwanRuntime,
} from '@pezhwan/core';
import {
  createAuthenticate,
  requireAuth,
  type PezhwanRequest,
} from '@pezhwan/express';

const PORT = Number(process.env.PORT ?? 5176);
const TENANT_ID = process.env.TENANT_ID ?? 'dev-tenant';
const APPLICATION_ID = process.env.APPLICATION_ID ?? 'dev-app';
const ISSUER = process.env.ISSUER ?? 'http://localhost:4011';
const AUDIENCE = 'pezhwan.clients';
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/pezhwan';
const MFA_ENC_KEY = process.env.MFA_ENCRYPTION_KEY ?? 'cGV6aHdhbi1kZW1vLW1mYS1rZXktMDEyMzQ1Njc4OWE=';

await mongoose.connect(MONGODB_URI);
console.log('[passwordless] connected to MongoDB');

const runtime: PezhwanRuntime = createPezhwan({
  tenantId: TENANT_ID,
  applicationId: APPLICATION_ID,
  issuer: ISSUER,
  audience: AUDIENCE,
  mfaEncryptionKey: MFA_ENC_KEY,
  otpDelivery: {
    sendEmail: async (target: string, code: string) => {
      console.log(`\n=== [passwordless demo email] To ${target}: your code is ${code} ===\n`);
    },
  },
});

await initKeyPersistence(runtime, { directory: path.resolve(__dirname, 'keys') });
console.log(`[passwordless] signing keys ready in '${path.resolve(__dirname, 'keys')}'`);

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(__dirname, '.')));

const h = (fn: (req: PezhwanRequest, res: express.Response) => Promise<unknown>) => (
  req: PezhwanRequest,
  res: express.Response,
): void => {
  fn(req, res).then(
    (data) => res.json({ success: true, data }),
    (err: { code?: string; message?: string; status?: number }) => {
      const status = err.status ?? (err.code ? 400 : 500);
      console.error(`[passwordless] ${req.method} ${req.path} failed:`, err);
      res.status(status).json({
        success: false,
        error: { code: err.code ?? 'ERROR', message: err.message ?? 'Unexpected error' },
      });
    },
  );
};

// Bootstrap account so the demo is usable standalone: magic-link sign-in needs
// an existing user, so a first-time register is provided (email + password).
app.post(
  '/api/register',
  h(async (req) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      const err = new Error('email and password are required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await runtime.auth.register({
      tenantId: TENANT_ID,
      applicationId: APPLICATION_ID,
      email,
      password,
    });
    return {
      user: { id: String(result.user._id), email: result.user.email },
      tokens: result.tokens,
    };
  }),
);

app.post(
  '/api/magic/send',
  h(async (req) => {
    const { email } = req.body ?? {};
    if (!email) {
      const err = new Error('email is required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await runtime.auth.sendMagicLink({ applicationId: APPLICATION_ID, email });
    // Simulated inbox: the link "email" is delivered to the server console.
    // Always answer identically so we never reveal whether an account exists.
    if (result.token) {
      console.log(
        `\n================ [passwordless] magic link for ${email} ================\n` +
          `  TOKEN: ${result.token}\n` +
          `  expiresIn: ${result.expiresIn} seconds\n` +
          '  Paste this token into the "Sign in" step of the demo UI.\n' +
          `==========================================================\n`,
      );
    }
    return { sent: true, expiresIn: result.expiresIn ?? 900 };
  }),
);

app.post(
  '/api/magic/redeem',
  h(async (req) => {
    const { email, token } = req.body ?? {};
    if (!email || !token) {
      const err = new Error('email and token are required') as Error & { code: string };
      err.code = 'MISSING_FIELDS';
      throw err;
    }
    const result = await runtime.auth.redeemMagicLink({
      applicationId: APPLICATION_ID,
      token,
    });
    console.log(
      `[passwordless] redeemed magic link for ${email} -> user ${String(result.user._id)}`,
    );
    return {
      user: { id: String(result.user._id), email: result.user.email },
      tokens: result.tokens,
      redirectUri: result.redirectUri ?? null,
    };
  }),
);

app.get(
  '/api/me',
  createAuthenticate(runtime),
  requireAuth(),
  h(async (req) => {
    const identity = req.pezhwan;
    if (!identity) {
      const err = new Error('Authentication required') as Error & { code: string; status: number };
      err.code = 'UNAUTHENTICATED';
      err.status = 401;
      throw err;
    }
    const user = await UserModel.findOne({
      _id: identity.userId,
      tenantId: identity.tenantId,
    })
      .select('email')
      .lean();
    return {
      id: identity.userId,
      email: user?.email ?? null,
      tenantId: identity.tenantId,
      applicationId: identity.applicationId,
      sessionId: identity.sessionId,
      authMethod: identity.authMethod,
      roles: identity.roles,
      permissions: identity.permissions,
    };
  }),
);

app.listen(PORT, () => {
  console.log(`[passwordless] demo listening on http://localhost:${PORT}`);
  console.log(
    `[passwordless] issuer ${ISSUER} · tenant ${TENANT_ID} · application ${APPLICATION_ID}`,
  );
  console.log(`[passwordless] magic-link entry on /api/magic/send and /api/magic/redeem`);
});