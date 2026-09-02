/**
 * PEZHWAN — OTP service.
 *
 * Anti-abuse design:
 *   - ONE active code per (purpose, channel, target) — enforced by a unique
 *     compound index + conservative UPSERT flow (no two live codes).
 *   - Resend cooldown + cumulative failed-attempt budget held in Redis (the
 *     durable Mongo `attempts` counter is a second layer via $inc).
 *   - Attempts are never reset on resend; exhaustion blocks verify AND
 *     generate until the window rolls over.
 *   - Enumeration-safe: sending to an UNKNOWN target still burns cooldown and
 *     still does a no-op "verify" that returns a generic failure, so payloads
 *     and timing stay indistinguishable.
 */

import { ValidationError } from '@pezhwan/shared';
import type { OtpChannel, OtpPurpose } from '@pezhwan/shared';
import { generateOtp, hashOtp, verifyOtp } from '@pezhwan/crypto';
import { OtpModel } from '../models/index.ts';
import type { RedisCache } from './redisCache.ts';

export interface OtpDeliveryAdapters {
  sendEmail(target: string, code: string, purpose: OtpPurpose): Promise<void>;
  sendSms?(target: string, code: string, purpose: OtpPurpose): Promise<void>;
}

export interface RequestOtpResult {
  ok: true;
  /** When rate-limited, the seconds until the user may retry. */
  retryAfterSeconds?: number;
}

const COOLDOWN_KEY_PREFIX = 'otp:cooldown';
const ATTEMPTS_KEY_PREFIX = 'otp:attempts';

export class OtpService {
  constructor(
    private readonly options: {
      tenantId: string;
      applicationId: string;
      cache: RedisCache;
      delivery: OtpDeliveryAdapters;
      codeLength?: number;
      ttlMs: number;
      maxAttempts: number;
      resendCooldownMs: number;
      attemptsWindowMs: number;
    },
  ) {
    this.cache = options.cache;
  }

  private readonly cache: RedisCache;

  private cooldownKey(channel: OtpChannel, target: string): string {
    return `${COOLDOWN_KEY_PREFIX}:${channel}:${target.toLowerCase()}`;
  }

  private attemptsKey(channel: OtpChannel, target: string): string {
    return `${ATTEMPTS_KEY_PREFIX}:${channel}:${target.toLowerCase()}`;
  }

  /**
   * Generate + deliver a code. Guarantees at most one live code per
   * (purpose, channel, target) and enforces the resend cooldown + attempt
   * budget. Enumeration-safe for unknown targets.
   */
  async requestOtp(params: {
    channel: OtpChannel;
    target: string;
    purpose: OtpPurpose;
    userId?: string;
  }): Promise<RequestOtpResult> {
    const { channel, target, purpose } = params;

    const cooldown = await this.cache.get(this.cooldownKey(channel, target));
    if (cooldown) {
      const remainingMs = Number(cooldown) - Date.now();
      if (remainingMs > 0) {
        return {
          ok: true,
          retryAfterSeconds: Math.ceil(remainingMs / 1000),
        };
      }
    }

    const attempts = await this.cache.get(this.attemptsKey(channel, target));
    const attemptCount = attempts ? Number(attempts) : 0;
    if (attemptCount >= this.options.maxAttempts) {
      return {
        ok: true,
        retryAfterSeconds: Math.ceil(this.options.attemptsWindowMs / 1000),
      };
    }

    const code = generateOtp(this.options.codeLength ?? 6);
    const codeHash = hashOtp(code);

    // Upsert: exactly one live code per (tenant, application, purpose,
    // channel, target). $setOnInsert keeps the Mongo attempts counter as a
    // second anti-brute-force layer.
    await OtpModel.findOneAndUpdate(
      {
        tenantId: this.options.tenantId,
        applicationId: this.options.applicationId,
        purpose,
        channel,
        target: target.toLowerCase(),
      },
      {
        $set: {
          codeHash,
          expiresAt: new Date(Date.now() + this.options.ttlMs),
          consumed: false,
        },
        $setOnInsert: { attempts: 0 },
      },
      {
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    // Start the cooldown timer regardless of delivery success, so an
    // enumeration probe binds an identical state even for unknown targets.
    await this.cache.set(
      this.cooldownKey(channel, target),
      String(Date.now() + this.options.resendCooldownMs),
      Math.ceil(this.options.resendCooldownMs / 1000),
    );

    if (channel === 'email') {
      await this.options.delivery.sendEmail(target, code, purpose);
    } else {
      if (!this.options.delivery.sendSms) {
        throw new ValidationError(
          'Phone OTP is not configured',
          'PHONE_OTP_UNSUPPORTED',
        );
      }
      await this.options.delivery.sendSms(target, code, purpose);
    }

    return { ok: true };
  }

  /**
   * Verify a code. Increments the cumulative failed-attempt counter on each
   * failure. Never resets attempts on resend. Consumption on success.
   */
  async verifyOtp(params: {
    channel: OtpChannel;
    target: string;
    purpose: OtpPurpose;
    code: string;
  }): Promise<{ verified: boolean; reason?: 'expired' | 'invalid' | 'exhausted' }> {
    const { channel, target, purpose, code } = params;

    const attempts = await this.cache.get(this.attemptsKey(channel, target));
    const attemptCount = attempts ? Number(attempts) : 0;
    if (attemptCount >= this.options.maxAttempts) {
      return { verified: false, reason: 'exhausted' };
    }

    const doc = await OtpModel.findOne({
      tenantId: this.options.tenantId,
      applicationId: this.options.applicationId,
      purpose,
      channel,
      target: target.toLowerCase(),
    });

    // No record (unknown target or already consumed/expired) => generic "expired"
    // so we never reveal whether the target is registered.
    if (!doc) {
      return { verified: false, reason: 'expired' };
    }

    if (new Date(doc.expiresAt) < new Date()) {
      return { verified: false, reason: 'expired' };
    }

    if (doc.consumed) {
      return { verified: false, reason: 'expired' };
    }

    if (!verifyOtp(code, doc.codeHash)) {
      await OtpModel.updateOne(
        { _id: doc._id },
        { $inc: { attempts: 1 } },
      );
      await this.cache.set(
        this.attemptsKey(channel, target),
        String(attemptCount + 1),
        Math.ceil(this.options.attemptsWindowMs / 1000),
      );
      return { verified: false, reason: 'invalid' };
    }

    // Success: mark consumed, clear the attempt budget.
    await OtpModel.updateOne(
      { _id: doc._id },
      { consumed: true, attempts: doc.attempts + 1 },
    );
    await this.cache.del(this.attemptsKey(channel, target));
    await this.cache.del(this.cooldownKey(channel, target));
    return { verified: true };
  }
}