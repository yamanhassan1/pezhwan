/**
 * PEZHWAN — Angular route guard.
 *
 * Redirects guests to `/login` (preserving the target URL as `redirect`) and
 * lets authenticated users through. A UX convenience only — server-side
 * middleware enforces every authorization decision.
 */

import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { ActivatedRouteSnapshot, CanActivateFn, RouterStateSnapshot } from '@angular/router';
import { AuthService } from './auth.service.ts';

export const pezhwanAuthGuard: CanActivateFn = (
  _route: ActivatedRouteSnapshot,
  state: RouterStateSnapshot,
) => {
  const auth = inject(AuthService);
  if (auth.isAuthenticated) {
    return true;
  }
  const router = inject(Router);
  return router.createUrlTree(['/login'], { queryParams: { redirect: state.url } });
};