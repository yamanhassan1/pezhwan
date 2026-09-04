/**
 * PEZHWAN — OTP delivery wiring for the reference identity server.
 *
 * Builds an `OtpDeliveryManager` from the validated typed config and exposes:
 *   - `deliveryCallbacks` — the `{ sendEmail, sendSms }` callbacks handed to
 *     `createPezhwan` so real email/SMS OTPs are sent through the configured
 *     provider chain (with retry + circuit breaker + failover).
 *   - `healthCheck()` — probes every configured provider for the readiness
 *     endpoint.
 *
 * Provider selection is made from env (see config/env.ts). Dev/test default to
 * the console/mock providers; production fails fast at startup if a real
 * provider is not configured (enforced by `assertProductionSafety`).
 */

import {
  OtpDeliveryManager,
  ConsoleEmailProvider,
  NodemailerSmtpProvider,
  SendGridProvider,
  AwsSesProvider,
  MockSmsProvider,
  TwilioSmsProvider,
  AwsSnsProvider,
  type OtpDeliverySummary,
  type OtpPurpose,
} from '@pezhwan/core';
import type { config as cfg } from './config/index.ts';

type Config = typeof cfg;

export function buildOtpDelivery(config: Config): {
  delivery: {
    sendEmail: (t: string, c: string, p: OtpPurpose) => Promise<void>;
    sendSms: (t: string, c: string, p: OtpPurpose) => Promise<void>;
  };
  manager: OtpDeliveryManager;
  healthCheck: () => Promise<OtpDeliverySummary>;
} {
  const emailProviders = buildEmailProviders(config);
  const smsProviders = buildSmsProviders(config);
  const manager = new OtpDeliveryManager({ emailProviders, smsProviders });

  const delivery = {
    sendEmail: (target: string, code: string, purpose: OtpPurpose): Promise<void> =>
      manager.sendEmail(target, code, purpose),
    sendSms: (target: string, code: string, purpose: OtpPurpose): Promise<void> =>
      manager.sendSms(target, code, purpose),
  };

  return { delivery, manager, healthCheck: () => manager.healthCheck() };
}

function buildEmailProviders(config: Config) {
  const kind = config.otp.emailProvider;
  const p = config.otpProviders;
  switch (kind) {
    case 'smtp':
      if (!p.smtp.host || !p.smtp.from) {
        throw new Error('SMTP email provider requires host + from');
      }
      return [
        new NodemailerSmtpProvider({
          host: p.smtp.host,
          port: p.smtp.port ?? 587,
          secure: p.smtp.secure,
          user: p.smtp.user,
          pass: p.smtp.pass,
          from: p.smtp.from,
        }),
      ];
    case 'sendgrid':
      if (!p.sendgrid.apiKey || !p.sendgrid.from) {
        throw new Error('SendGrid email provider requires apiKey + from');
      }
      return [new SendGridProvider({ apiKey: p.sendgrid.apiKey, from: p.sendgrid.from })];
    case 'ses':
      if (!p.ses.region || !p.ses.accessKeyId || !p.ses.secretAccessKey || !p.ses.from) {
        throw new Error('SES email provider requires region + access key + from');
      }
      return [
        new AwsSesProvider({
          credentials: {
            region: p.ses.region,
            accessKeyId: p.ses.accessKeyId,
            secretAccessKey: p.ses.secretAccessKey,
          },
          from: p.ses.from,
        }),
      ];
    case 'console':
    default:
      // Dev/test only: log the OTP to the console (never a real send).
      return [new ConsoleEmailProvider({ capture: true })];
  }
}

function buildSmsProviders(config: Config) {
  const kind = config.otp.smsProvider;
  const p = config.otpProviders;
  switch (kind) {
    case 'twilio':
      if (!p.twilio.accountSid || !p.twilio.authToken || !p.twilio.from) {
        throw new Error('Twilio SMS provider requires accountSid + authToken + from');
      }
      return [
        new TwilioSmsProvider({
          accountSid: p.twilio.accountSid,
          authToken: p.twilio.authToken,
          from: p.twilio.from,
        }),
      ];
    case 'sns':
      if (!p.sns.region || !p.sns.accessKeyId || !p.sns.secretAccessKey) {
        throw new Error('SNS SMS provider requires region + access key credentials');
      }
      return [
        new AwsSnsProvider({
          credentials: {
            region: p.sns.region,
            accessKeyId: p.sns.accessKeyId,
            secretAccessKey: p.sns.secretAccessKey,
          },
          region: p.sns.region,
        }),
      ];
    case 'mock':
    default:
      // Dev/test only: in-memory acceptance, never a real send.
      return [new MockSmsProvider({ capture: true })];
  }
}
