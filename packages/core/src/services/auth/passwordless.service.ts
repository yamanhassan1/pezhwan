/**
 * PEZHWAN — Passwordless service.
 *
 * Provides passwordless authentication via one-time delivery channels that do
 * not rely on shared secrets: email OTP, phone OTP, and magic-link delegation.
 * Delegates the actual code/verification work to the OTP and magic-link
 * services.
 */

import type { OtpService } from '../otp.service.ts';
import type { OtpChannel, OtpPurpose } from '@pezhwan/shared';
import { MagicLinkService } from './magic-link.service.ts';

export interface PasswordlessOptions {
  otp: Pick<OtpService, 'requestOtp' | 'verifyOtp'>;
  magicLink?: MagicLinkService;
}

export interface PasswordlessChallengeResult {
  delivery: 'email' | 'phone' | 'magic-link';
  magicUrl?: string;
}

export class PasswordlessService {
  private readonly otp: PasswordlessOptions['otp'];
  private readonly magicLink?: MagicLinkService;

  constructor(options: PasswordlessOptions) {
    this.otp = options.otp;
    this.magicLink = options.magicLink;
  }

  async sendChallenge(
    channel: OtpChannel,
    target: string,
    purpose: OtpPurpose,
    userId?: string,
  ): Promise<PasswordlessChallengeResult> {
    await this.otp.requestOtp({ channel, target, purpose, userId });
    return { delivery: channel };
  }

  async sendMagicLink(input: { subject: string; audience: string; redirectUri?: string }): Promise<PasswordlessChallengeResult> {
    if (!this.magicLink) throw new Error('Magic-link delivery is not configured');
    const link = this.magicLink.create(input);
    return { delivery: 'magic-link', magicUrl: link.url };
  }

  async verifyCode(
    channel: OtpChannel,
    target: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<{ verified: boolean; reason?: 'expired' | 'invalid' | 'exhausted' }> {
    return this.otp.verifyOtp({ channel, target, purpose, code });
  }
}