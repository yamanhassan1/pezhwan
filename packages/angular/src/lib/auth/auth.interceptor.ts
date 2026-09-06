/**
 * PEZHWAN — Angular HTTP interceptor.
 *
 * Attaches `Authorization: Bearer <token>` to every outgoing request when an
 * access token is present. Registered with `HTTP_INTERCEPTORS` by
 * `PezhwanModule`.
 */

import { Injectable, inject } from '@angular/core';
import { HTTP_INTERCEPTORS, type HttpEvent, type HttpHandler, type HttpInterceptor, type HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service.ts';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly auth = inject(AuthService);

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    const token = this.auth.accessToken();
    if (!token) {
      return next.handle(req);
    }
    return next.handle(
      req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      }),
    );
  }
}

/** Provider array { provide: HTTP_INTERCEPTORS, useClass, multi: true }. */
export const AUTH_INTERCEPTOR_PROVIDER = {
  provide: HTTP_INTERCEPTORS,
  useClass: AuthInterceptor,
  multi: true,
} as const;