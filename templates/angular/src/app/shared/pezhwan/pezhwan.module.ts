import { NgModule } from '@angular/core';
import { PezhwanModule } from '@pezhwan/angular';

/** Base URL of the PEZHWAN identity server (set `window.PEZHWAN_URL` to override). */
export const pezhwanBaseUrl: string =
  (globalThis as { PEZHWAN_URL?: string }).PEZHWAN_URL ?? 'http://localhost:4011';

@NgModule({
  imports: [PezhwanModule.forRoot({ baseUrl: pezhwanBaseUrl })],
})
export class PezhwanFeatureModule {}
