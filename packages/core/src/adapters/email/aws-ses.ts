/**
 * PEZHWAN — AWS SES email OTP provider (REST over HTTPS with SigV4).
 *
 * Sends transactional email through Amazon Simple Email Service using its
 * Query-protocol (form-encoded) REST API, signed with AWS Signature Version 4.
 * Credentials come from provider options (e.g. from a secret provider / IAM
 * credentials) — never embedded.
 */

import type { DeliveryResult, HealthStatus, OtpProvider, OtpSendParams } from '../otp-provider.ts';
import {
  callHttp,
  parseJsonBody,
  signAwsSigV4,
  awsFormBody,
  type AwsCredentials,
} from '../http.ts';

export interface AwsSesProviderOptions {
  credentials: Omit<AwsCredentials, 'service'>;
  from: string;
  subjectTemplate?: string;
  id?: string;
  timeoutMs?: number;
}

export class AwsSesProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'email' as const;

  constructor(private readonly options: AwsSesProviderOptions) {
    const c = options.credentials;
    if (!c.accessKeyId || !c.secretAccessKey || !c.region) {
      throw new Error('AwsSesProvider requires AWS accessKeyId, secretAccessKey and region');
    }
    this.id = options.id ?? 'aws-ses';
  }

  private buildRequest(
    params: OtpSendParams,
    action: 'SendEmail',
  ): {
    url: string;
    headers: Record<string, string>;
    body: string;
  } {
    const { region, accessKeyId, secretAccessKey, sessionToken } = this.options.credentials;
    const host = `email.${region}.amazonaws.com`;
    const path = '/';
    const subject = (this.options.subjectTemplate ?? 'Your verification code: {code}').replace(
      /\{code\}/g,
      params.code,
    );
    const form = awsFormBody({
      Action: action,
      Version: '2010-12-01',
      Source: this.options.from,
      'Destination.ToAddresses.member.1': params.to,
      'Message.Subject.Data': subject,
      'Message.Subject.Charset': 'UTF-8',
      'Message.Body.Text.Data': `Your PEZHWAN verification code is ${params.code}`,
      'Message.Body.Text.Charset': 'UTF-8',
    });
    const signed = signAwsSigV4(
      { accessKeyId, secretAccessKey, sessionToken, region, service: 'ses' },
      { method: 'POST', host, path, requestPayload: form },
    );
    return {
      url: `https://${host}${path}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: signed.authorization,
        'X-Amz-Date': signed['x-amz-date'],
        'X-Amz-Content-Sha256': signed['x-amz-content-sha256'],
        ...(signed['x-amz-security-token']
          ? { 'X-Amz-Security-Token': signed['x-amz-security-token'] }
          : {}),
      },
      body: form,
    };
  }

  async sendEmail(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();
    try {
      const req = this.buildRequest(params, 'SendEmail');
      const res = await callHttp({
        url: req.url,
        method: 'POST',
        headers: req.headers,
        body: req.body,
        timeoutMs: this.options.timeoutMs,
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return {
          ok: true,
          accepted: true,
          providerId: this.id,
          latencyMs: Date.now() - started,
          statusCode: res.statusCode,
        };
      }
      const { text } = parseJsonBody(res);
      return {
        ok: false,
        accepted: false,
        providerId: this.id,
        latencyMs: Date.now() - started,
        error: `SES rejected with ${res.statusCode}: ${text.slice(0, 300)}`,
        statusCode: res.statusCode,
      };
    } catch (err) {
      return {
        ok: false,
        accepted: false,
        providerId: this.id,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    const started = Date.now();
    try {
      const req = this.buildRequest({ to: 'health@example.invalid', code: '000000' }, 'SendEmail');
      const res = await callHttp({
        url: req.url,
        method: 'POST',
        headers: req.headers,
        body: req.body,
        timeoutMs: this.options.timeoutMs,
      });
      return {
        ok: true,
        providerId: this.id,
        latencyMs: Date.now() - started,
        detail: `http ${res.statusCode}`,
      };
    } catch (err) {
      return {
        ok: false,
        providerId: this.id,
        detail: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - started,
      };
    }
  }
}
