import assert from 'node:assert/strict';
import { test } from 'node:test';

import express from 'express';
import type { Express } from 'express';
import { jwksHandler, discoveryHandler, rateLimit } from '@pezhwan/express';
import { createPezhwan } from '@pezhwan/core';

let runtime: ReturnType<typeof createPezhwan>;

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.get('/.well-known/jwks.json', jwksHandler(runtime));
  app.get('/.well-known/openid-configuration', discoveryHandler(runtime));
  app.use('/v1/admin/status', rateLimit(runtime, { type: 'api' }), (_req, res) => {
    res.json({ success: true, data: { status: 'ok' } });
  });
  app.use(
    (
      err: { status?: number; code?: string; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res.status(err.status ?? 500).json({
        success: false,
        error: {
          code: (err as { code?: string }).code ?? 'INTERNAL',
          message: err.message ?? 'Error',
        },
      });
    },
  );
  return app;
}

function listen(app: Express): Promise<{ port: number; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0);
    server.once('listening', () => {
      const port = (server.address() as { port: number }).port;
      resolve({
        port,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

test.before(() => {
  runtime = createPezhwan({
    issuer: 'https://id.example.com',
    audience: 'pezhwan.clients',
    tenantId: '000000000000000000000001',
    applicationId: '000000000000000000000002',
    otpDelivery: { sendEmail: async () => {} },
  });
});

test('JWKS is served over plain HTTP', async () => {
  const { port, close } = await listen(buildApp());
  try {
    const res = await fetch(`http://127.0.0.1:${port}/.well-known/jwks.json`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { keys: Array<{ alg: string }> };
    assert.ok(body.keys.length >= 1);
    assert.equal(body.keys[0]!.alg, 'RS256');
  } finally {
    await close();
  }
});

test('OIDC discovery reflects the runtime issuer', async () => {
  const { port, close } = await listen(buildApp());
  try {
    const res = await fetch(`http://127.0.0.1:${port}/.well-known/openid-configuration`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { issuer: string; grant_types_supported?: string[] };
    assert.equal(body.issuer, runtime.config.issuer);
    assert.ok(Array.isArray(body.grant_types_supported));
  } finally {
    await close();
  }
});

test('admin status endpoint answers with a JSON envelope', async () => {
  const { port, close } = await listen(buildApp());
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/admin/status`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { success: boolean; data: { status: string } };
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ok');
  } finally {
    await close();
  }
});
