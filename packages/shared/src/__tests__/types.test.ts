import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIT_EVENT } from '../types/index.ts';
import { AUDIT_EVENT_SEVERITY } from '../constants/audit-events.ts';
import { DOMAIN_EVENT, createDomainEvent } from '../events/domain-events.ts';
import {
  isEmail,
  isPhone,
  isUuid,
  isSlug,
  isStrongPassword,
  evaluatePasswordStrength,
} from '../utils/validators.ts';
import {
  randomToken,
  sha256Hex,
  redactEmail,
  redactPhone,
  maskSecret,
  isPlainObject,
  slugify,
} from '../utils/helpers.ts';
import { EMAIL_RE } from '../utils/regex.ts';

describe('shared primitives', () => {
  it('exposes the canonical audit event catalog', () => {
    assert.equal(AUDIT_EVENT.LOGIN_SUCCESS, 'LOGIN_SUCCESS');
    assert.ok(Object.keys(AUDIT_EVENT).length > 30);
  });

  it('classifies every audit event with a severity', () => {
    for (const event of Object.values(AUDIT_EVENT)) {
      assert.ok(AUDIT_EVENT_SEVERITY[event] !== undefined, event);
    }
  });

  it('builds domain events', () => {
    assert.equal(DOMAIN_EVENT.USER_CREATED, 'user.created');
    const event = createDomainEvent(DOMAIN_EVENT.USER_CREATED, { email: 'a@b.co' }, {
      userId: 'u1',
    });
    assert.equal(event.name, 'user.created');
    assert.equal(event.userId, 'u1');
    assert.ok(event.id.length > 0);
    assert.ok(event.occurredAt instanceof Date);
  });

  it('validates emails, phones, uuids and slugs', () => {
    assert.equal(isEmail('user@example.com'), true);
    assert.equal(isEmail('not-an-email'), false);
    assert.equal(EMAIL_RE.test('user@example.com'), true);
    assert.equal(isPhone('+15551234567'), true);
    assert.equal(isPhone('abc'), false);
    assert.equal(isUuid('0f8fad5b-d9cb-469f-a165-70867728950e'), true);
    assert.equal(isUuid('nope'), false);
    assert.equal(isSlug('transport-web'), true);
    assert.equal(isSlug('Transport Web'), false);
  });

  it('validates password strength', () => {
    assert.equal(isStrongPassword('CorrectHorseBatteryStaple!9'), true);
    assert.equal(isStrongPassword('short'), false);
    assert.equal(isStrongPassword('lowercaseonly9'), false);
    const evalResult = evaluatePasswordStrength('CorrectHorseBatteryStaple!9');
    assert.ok(evalResult.score >= 3);
  });

  it('provides crypto and sanitization helpers', () => {
    assert.equal(randomToken(8).length, 11);
    assert.equal(sha256Hex('abc'), sha256Hex('abc'));
    assert.equal(sha256Hex('abc').length, 64);
    assert.equal(redactEmail('user@example.com'), 'u***@example.com');
    assert.ok(redactPhone('+15551234567').includes('***'));
    assert.equal(maskSecret('abcd1234'), 'abcd\u2022\u2022\u2022\u2022');
    assert.equal(isPlainObject({}), true);
    assert.equal(isPlainObject([]), false);
    assert.equal(isPlainObject(null), false);
    assert.equal(slugify('Transport Web'), 'transport-web');
  });
});
