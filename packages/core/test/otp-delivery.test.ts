import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  OtpDeliveryManager,
  ConsoleEmailProvider,
  MockSmsProvider,
  type DeliveryResult,
  type HealthStatus,
  type OtpProvider,
  type OtpSendParams,
} from '@pezhwan/core';

function makeInjectableProvider(
  id: string,
  failEmail = false,
  failSms = false,
): OtpProvider & { sent: OtpSendParams[] } {
  const sent: OtpSendParams[] = [];
  return {
    id,
    channel: 'both',
    async sendEmail(params: OtpSendParams): Promise<DeliveryResult> {
      if (failEmail)
        return {
          ok: false,
          accepted: false,
          providerId: id,
          latencyMs: 0,
          error: `fail ${id} email`,
          statusCode: 500,
        };
      sent.push(params);
      return { ok: true, accepted: true, providerId: id, latencyMs: 1 };
    },
    async sendSms(params: OtpSendParams): Promise<DeliveryResult> {
      if (failSms)
        return {
          ok: false,
          accepted: false,
          providerId: id,
          latencyMs: 0,
          error: `fail ${id} sms`,
          statusCode: 500,
        };
      sent.push(params);
      return { ok: true, accepted: true, providerId: id, latencyMs: 1 };
    },
    async healthCheck(): Promise<HealthStatus> {
      return { ok: true, providerId: id };
    },
    sent,
  };
}

test('console email + mock sms providers deliver and record captures', async () => {
  const email = new ConsoleEmailProvider({ capture: true });
  const sms = new MockSmsProvider({ capture: true });
  const manager = new OtpDeliveryManager({ emailProviders: [email], smsProviders: [sms] });

  await manager.sendEmail('a@example.com', '123456', 'login');
  await manager.sendSms('+1000', '654321', 'login');

  assert.equal(email.sent.length, 1);
  assert.equal(email.sent[0]!.code, '123456');
  assert.equal(sms.sent.length, 1);
  assert.equal(sms.sent[0]!.to, '+1000');
});

test('manager fails over to the next provider when the primary rejects', async () => {
  const primary = makeInjectableProvider('primary', true);
  const secondary = makeInjectableProvider('secondary');
  const manager = new OtpDeliveryManager({ emailProviders: [primary, secondary] });

  await manager.sendEmail('a@example.com', '111111', 'signup');

  assert.equal(primary.sent.length, 0);
  assert.equal(secondary.sent.length, 1);
  assert.equal(secondary.sent[0]!.code, '111111');
});

test('manager is fail-closed when every email provider rejects', async () => {
  const p1 = makeInjectableProvider('p1', true);
  const p2 = makeInjectableProvider('p2', true);
  const manager = new OtpDeliveryManager({ emailProviders: [p1, p2] });

  await assert.rejects(
    manager.sendEmail('a@example.com', '222222', 'login'),
    /OTP delivery failed/,
  );
});

test('manager throws when a channel has no configured provider', async () => {
  const manager = new OtpDeliveryManager({ emailProviders: [] });
  await assert.rejects(manager.sendEmail('a@example.com', '1', 'login'), /No email OTP provider/);
});

test('healthCheck reports provider availability and never throws', async () => {
  const email = new ConsoleEmailProvider();
  const failing = new MockSmsProvider({ failAll: true });
  const manager = new OtpDeliveryManager({ emailProviders: [email], smsProviders: [failing] });

  const summary = await manager.healthCheck();
  assert.equal(summary.email.available, true);
  assert.equal(summary.sms.available, false);
  assert.equal(summary.overall, true);
  assert.ok(summary.circuitStates['console-email']);
});
