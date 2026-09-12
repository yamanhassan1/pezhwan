/**
 * PEZHWAN — Express middleware facade.
 *
 * Re-exports the identity + authorization middleware from ./index.ts so the
 * modular layout mirrors the flat surface:
 *
 *   - extractToken / createAuthenticate / requireAuth
 *   - requireRole / requirePermission
 *   - jwksHandler
 *   - PezhwanRequest (type)
 */

export {
  extractToken,
  createAuthenticate,
  requireAuth,
  requireRole,
  requirePermission,
  jwksHandler,
  type PezhwanRequest,
} from './index.ts';