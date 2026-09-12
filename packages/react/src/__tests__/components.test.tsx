// Shared component-surface smoke test. Kept free of JSX so it runs under
// Node's strip-only TypeScript mode (no transform step for TSX parsing is
// needed, yet the `.tsx` extension matches the components layout).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AuthProvider,
  LoginForm,
  RegisterForm,
  MFALogin,
  MFASetup,
  PasswordlessLogin,
  Profile,
  ProtectedRoute,
  RequirePermission,
  RequireRole,
  SSOLogin,
  SessionManager,
  TrustedDevices,
  WebAuthnLogin,
  DataExport,
} from '@pezhwan/react';

const components = [
  AuthProvider,
  LoginForm,
  RegisterForm,
  MFALogin,
  MFASetup,
  PasswordlessLogin,
  Profile,
  ProtectedRoute,
  RequirePermission,
  RequireRole,
  SSOLogin,
  SessionManager,
  TrustedDevices,
  WebAuthnLogin,
  DataExport,
];

test('every SDK component is exported as a component factory', () => {
  for (const component of components) {
    assert.equal(
      typeof component,
      'function',
      `${component?.name ?? 'component'} must be a function`,
    );
  }
});