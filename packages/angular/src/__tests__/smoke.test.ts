import '@angular/compiler';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PezhwanModule,
  AuthService,
  SessionService,
  AuthInterceptor,
  pezhwanAuthGuard,
  PEZHWAN_CONFIG,
} from '@pezhwan/angular';

test('angular SDK exposes module, services, interceptor and guard', () => {
  assert.equal(typeof PezhwanModule, 'function');
  assert.equal(typeof PezhwanModule.forRoot, 'function');
  assert.equal(typeof AuthService, 'function');
  assert.equal(typeof SessionService, 'function');
  assert.equal(typeof AuthInterceptor, 'function');
  assert.equal(typeof pezhwanAuthGuard, 'function');
  assert.ok(PEZHWAN_CONFIG, 'config injection token must exist');
});