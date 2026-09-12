import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PezhwanError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  RateLimitError,
  TokenError,
  SessionError,
  ConfigurationError,
  ProviderError,
  SecurityDependencyError,
  NotFoundError,
  SecurityEventError,
  ComplianceError,
  RiskError,
  SecurityError,
} from '../errors/index.ts';
import { ERROR_CODES } from '../constants/errors.ts';

describe('PezhwanError hierarchy', () => {
  it('sets code, status, name and requestId', () => {
    const err = new AuthenticationError('bad login', 'AUTHENTICATION_FAILED', {
      requestId: 'r1',
    });
    assert.equal(err.status, 401);
    assert.equal(err.code, 'AUTHENTICATION_FAILED');
    assert.equal(err.name, 'AuthenticationError');
    assert.equal(err.requestId, 'r1');
    assert.ok(err instanceof PezhwanError);
  });

  it('maps the canonical HTTP statuses', () => {
    assert.equal(new AuthorizationError().status, 403);
    assert.equal(new ValidationError().status, 400);
    assert.equal(new RateLimitError().status, 429);
    assert.equal(new TokenError().status, 401);
    assert.equal(new SessionError().status, 401);
    assert.equal(new ConfigurationError().status, 500);
    assert.equal(new ProviderError().status, 502);
    assert.equal(new SecurityDependencyError().status, 503);
    assert.equal(new NotFoundError().status, 404);
    assert.equal(new SecurityEventError().status, 403);
  });

  it('supports compliance, risk and security errors', () => {
    const compliance = new ComplianceError();
    assert.equal(compliance.status, 403);
    assert.equal(compliance.code, ERROR_CODES.COMPLIANCE_FAILED);
    assert.equal(new RiskError().status, 429);
    assert.equal(new RiskError().code, ERROR_CODES.RISK_EVENT);
    assert.equal(new SecurityError().status, 403);
    assert.equal(new SecurityError().code, ERROR_CODES.SECURITY_ERROR);
  });

  it('captures structured details', () => {
    const err = new ValidationError('bad', 'VALIDATION_FAILED', {
      details: { field: 'email' },
    });
    assert.deepEqual(err.details, { field: 'email' });
    assert.equal(err.message, 'bad');
  });

  it('exposes stable error codes', () => {
    assert.equal(ERROR_CODES.FAILED_SECURITY_DEPENDENCY, 'FAILED_SECURITY_DEPENDENCY');
    assert.equal(ERROR_CODES.TOKEN_NOT_ACTIVE, 'TOKEN_NOT_ACTIVE');
  });
});
