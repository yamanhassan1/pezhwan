/**
 * PEZHWAN — Session trust service.
 *
 * Maintains per-device trust so that step-up (MFA) can be skipped on
 * recognized devices and re-requested on new or risky ones.
 */

import type { DeviceInfo } from './device.service.ts';

export type TrustLevel = 'none' | 'new' | 'recognized' | 'verified';

export interface TrustAssessment {
  level: TrustLevel;
  reason: string;
  trustedDevices: number;
}

export interface TrustStore {
  countTrusted(userId: string, excludedDeviceId?: string): Promise<number>;
  isTrusted(userId: string, deviceId: string): Promise<boolean>;
  trust(userId: string, deviceId: string, ttlMs?: number): Promise<void>;
  revoke(userId: string, deviceId: string): Promise<void>;
}

export interface TrustServiceOptions {
  store: TrustStore;
  /** When to auto-skip MFA. Default 7200 (2 hours). */
  gracePeriodMs?: number;
}

export class TrustService {
  private readonly store: TrustStore;

  constructor(options: TrustServiceOptions) {
    this.store = options.store;
  }

  async assess(userId: string, device: DeviceInfo): Promise<TrustAssessment> {
    if (device.category === 'bot') {
      return { level: 'none', reason: 'bot', trustedDevices: 0 };
    }
    const trusted = await this.store.isTrusted(userId, device.id);
    if (trusted) {
      return { level: 'recognized', reason: 'known-device', trustedDevices: 1 };
    }
    const count = await this.store.countTrusted(userId);
    if (count === 0) {
      return { level: 'new', reason: 'first-device', trustedDevices: 0 };
    }
    return { level: 'new', reason: 'unknown-device', trustedDevices: count };
  }

  trust(userId: string, deviceId: string, ttlMs?: number): Promise<void> {
    return this.store.trust(userId, deviceId, ttlMs);
  }

  revoke(userId: string, deviceId: string): Promise<void> {
    return this.store.revoke(userId, deviceId);
  }
}