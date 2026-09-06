/**
 * PEZHWAN — Angular SDK module.
 *
 * `PezhwanModule.forRoot({ baseUrl })` wires the AuthService, SessionService
 * and the auth HTTP interceptor. Inject `PEZHWAN_CONFIG` anywhere to read the
 * resolved configuration.
 */

import { ModuleWithProviders, NgModule, Provider } from '@angular/core';
import { PEZHWAN_CONFIG, AuthService, type PezhwanAuthConfig } from './auth/auth.service.ts';
import { SessionService } from './session/session.service.ts';
import { AUTH_INTERCEPTOR_PROVIDER } from './auth/auth.interceptor.ts';

@NgModule({
  providers: [
    AuthService,
    SessionService,
    AUTH_INTERCEPTOR_PROVIDER,
  ],
})
export class PezhwanModule {
  static forRoot(config: PezhwanAuthConfig): ModuleWithProviders<PezhwanModule> {
    const providers: Provider[] = [
      { provide: PEZHWAN_CONFIG, useValue: config },
      AuthService,
      SessionService,
      AUTH_INTERCEPTOR_PROVIDER,
    ];
    return {
      ngModule: PezhwanModule,
      providers,
    };
  }
}