/**
 * PEZHWAN — MFA migration alias.
 *
 * Thin re-export for scripts/migrate-mfa-secrets.mjs, the canonical MFA
 * legacy-secret migration utility. `node scripts/migrate-mfa.mjs` runs the
 * exact same code so the npm script "migrate:mfa" and this file behave
 * identically to the canonical entry point.
 */

import './migrate-mfa-secrets.mjs';
