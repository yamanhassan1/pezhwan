/**
 * PEZHWAN — MFA / trusted-device integration test.
 *
 * Exercises the real step-up decision pipeline: DeviceService fingerprints a
 * UA, TrustService answers from an in-memory store, TrustDeviceMiddleware
 * wraps both, and MfaMiddleware decides whether MFA is still required.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DeviceService,
  MfaMiddleware,
  TrustDeviceMiddleware,
  TrustService,
  type TrustStore,
} from '@pezhwan/core';

const USER_ID = '000000000000000000000101';

class InMemoryTrustStore implements TrustStore {
  private readonly trusted = new Map<string, Set<string>>();

  async countTrusted(userId: string, excludedDeviceId?: string): Promise<number> {
    const set = this.trusted.get(userId) ?? new Set<string>();
    if (!excludedDeviceId) return set.size;
    return set.has(excludedDeviceId) ? set.size - 1 : set.size;
  }

  async isTrusted(userId: string, deviceId: string): Promise<boolean> {
    return (this.trusted.get(userId) ?? new Set<string>()).has(deviceId);
  }

  async trust(userId: string, deviceId: string): Promise<void> {
    const set = this.trusted.get(userId) ?? new Set<string>();
    set.add(deviceId);
    this.trusted.set(userId, set);
  }

  async revoke(userId: string, deviceId: string): Promise<void> {
    this.trusted.get(userId)?.delete(deviceId);
  }
}

function buildPipeline() {
  const store = new InMemoryTrustStore();
  const trust = new TrustService({ store });
  const devices = new DeviceService();
  const trustDevice = new TrustDeviceMiddleware(trust, devices);
  // Runtime policy: step-up is NOT forced generically; staleness/risk decide.
  const mfa = new MfaMiddleware(() => false);
  return { store, trust, devices, trustDevice, mfa };
}

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const BOT_UA = 'Googlebot/2.1 (+http://www.google.com/bot.html)';

test('first device is a wall; a trusted device skips MFA', async () => {
  const { trustDevice, mfa } = buildPipeline();

  const first = await trustDevice.assess({ userId: USER_ID, userAgent: CHROME_UA });
  assert.equal(first.level, 'new');
  assert.equal(first.skipMfa, false);

  // User completes MFA; the device is now trusted.
  const device = new DeviceService().describe({ userAgent: CHROME_UA });
  await trustDevice.markTrusted(USER_ID, device.id);

  const second = await trustDevice.assess({ userId: USER_ID, userAgent: CHROME_UA });
  assert.equal(second.level, 'recognized');
  assert.equal(second.skipMfa, true);

  const decision = await mfa.evaluate({
    userId: USER_ID,
    mfaEnabled: true,
    authMethod: 'totp',
    sessionVerifiedAt: Date.now(),
  });
  assert.equal(decision.required, false);
});

test('bots are never trusted even after marking', async () => {
  const { trustDevice, devices } = buildPipeline();
  const botDevice = devices.describe({ userAgent: BOT_UA });
  await trustDevice.markTrusted(USER_ID, botDevice.id);

  const assess = await trustDevice.assess({ userId: USER_ID, userAgent: BOT_UA });
  assert.equal(assess.level, 'none');
  assert.equal(assess.skipMfa, false);
});

test('a stale step-up window forces MFA again', async () => {
  const { mfa } = buildPipeline();
  const stale = await mfa.evaluate({
    userId: USER_ID,
    mfaEnabled: true,
    authMethod: 'otp',
    sessionVerifiedAt: Date.now() - 11 * 60 * 1000,
  });
  assert.equal(stale.required, true);
  assert.equal(stale.challenge, 'otp');

  const fresh = await mfa.evaluate({
    userId: USER_ID,
    mfaEnabled: true,
    authMethod: 'totp',
    sessionVerifiedAt: Date.now(),
  });
  assert.equal(fresh.required, false);
});

test('accounts without MFA never require step-up', async () => {
  const { mfa } = buildPipeline();
  const decision = await mfa.evaluate({
    userId: USER_ID,
    mfaEnabled: false,
    authMethod: 'password',
    riskScore: 0.99,
  });
  assert.equal(decision.required, false);
});