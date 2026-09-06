/**
 * PEZHWAN — Trust-device middleware.
 *
 * Consults the session TrustService to decide whether MFA can be skipped for a
 * recognized device. Provides both a static decision and a responder for
 * setting a trust cookie.
 */

import type { TrustService } from '../services/session/trust.service.ts';
import type { DeviceService } from '../services/session/device.service.ts';
import type { TrustAssessment } from '../services/session/trust.service.ts';

export interface TrustDecision extends TrustAssessment {
  skipMfa: boolean;
}

export class TrustDeviceMiddleware {
  constructor(
    private readonly trust: TrustService,
    private readonly devices: DeviceService,
  ) {}

  async assess(input: {
    userId: string;
    userAgent?: string;
    xDeviceId?: string;
  }): Promise<TrustDecision> {
    const device = this.devices.describe({
      userAgent: input.userAgent,
      xDeviceId: input.xDeviceId,
    });
    const assessment = await this.trust.assess(input.userId, device);
    return {
      ...assessment,
      skipMfa: (assessment.level === 'recognized' || assessment.level === 'verified') && device.category !== 'bot',
    };
  }

  /** Marks a device as trusted after successful MFA. */
  markTrusted(userId: string, deviceId: string, ttlMs?: number): Promise<void> {
    return this.trust.trust(userId, deviceId, ttlMs);
  }

  revoke(userId: string, deviceId: string): Promise<void> {
    return this.trust.revoke(userId, deviceId);
  }
}