/**
 * PEZHWAN — User fixtures for integration tests.
 *
 * Plain, schema-aligned fixture records (no DB required). Shapes follow the
 * canonical UserDoc in models/user.model.ts.
 */

import type { UserDoc } from '../../models/user.model.ts';

export const USER_EMAIL = 'alice@example.com';
export const USER_PHONE = '+15550100';
export const MFA_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

export function fixtureUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return {
    _id: '000000000000000000000101' as unknown as UserDoc['_id'],
    tenantId: '000000000000000000000001',
    email: USER_EMAIL,
    phone: undefined,
    emailVerified: true,
    phoneVerified: false,
    isActive: true,
    tokenVersion: 1,
    passwordHash: '$argon2id$test-hash-not-a-real-secret',
    identities: [],
    failedLoginAttempts: 0,
    loginLockUntil: null,
    mfaEnabled: false,
    mfaSecret: null,
    mfaSecretVerifiedAt: null,
    mfaFailedAttempts: 0,
    mfaLockUntil: null,
    metadata: { name: 'Alice' },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  };
}

export const USERS = [fixtureUser()] as const;