import { Router } from 'express';
import type { PezhwanRuntime } from '@pezhwan/core';
import type { PezhwanRequest } from '@pezhwan/express';
import type { AuthMiddleware } from '../middleware/auth';

export function createAuthDemoRouter(runtime: PezhwanRuntime, auth: AuthMiddleware): Router {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { email, password, metadata } = (req.body ?? {}) as {
      email?: string;
      password?: string;
      metadata?: Record<string, unknown>;
    };
    const { user, tokens } = await runtime.auth.register({
      tenantId: runtime.config.tenantId,
      applicationId: runtime.config.applicationId,
      email,
      password,
      metadata,
    });
    res.status(201).json({
      success: true,
      data: {
        user: { id: String(user._id), email: user.email },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const result = await runtime.auth.loginPassword({
      applicationId: runtime.config.applicationId,
      email,
      password: password ?? '',
    });
    if (result.mfaRequired) {
      res.json({ success: true, data: { mfaRequired: true, userId: result.userId } });
      return;
    }
    const tokens = result.tokens!;
    res.json({
      success: true,
      data: {
        user: { id: String(result.user!._id), email: result.user!.email },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  });

  router.get('/me', auth.authenticate, auth.requireAuth, (req: PezhwanRequest, res) => {
    const identity = req.pezhwan!;
    res.json({
      success: true,
      data: {
        id: identity.userId,
        tenantId: identity.tenantId,
        applicationId: identity.applicationId,
        roles: identity.roles,
        permissions: identity.permissions,
      },
    });
  });

  return router;
}