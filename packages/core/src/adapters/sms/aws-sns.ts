/**
 * PEZHWAN — AWS SNS SMS OTP provider (Query API over HTTPS with SigV4).
 *
 * Publishes a text message as an SMS through Amazon SNS's Query protocol,
 * signed with AWS Signature Version 4 and sent directly with the platform
 * `fetch` (no vendor SDK). Credentials are supplied via provider options —
 * never embedded or logged.
 *
 * The Publish action targets a phone number directly (`PhoneNumber`); the SMS
 * type is set to transactional so short codes are delivered promptly.
 */

import type { DeliveryResult, HealthStatus, OtpProvider, OtpSendParams } from '../otp-provider.ts';
import {
  callHttp,
  parseJsonBody,
  signAwsSigV4,
  awsFormBody,
  type AwsCredentials,
} from '../http.ts';

export interface AwsSnsProviderOptions {
  credentials: Omit<AwsCredentials, 'service'>;
  region: string;
  /** SMS type: 'Transactional' (default) or 'Promotional'. */
  smsType?: 'Transactional' | 'Promotional';
  id?: string;
  timeoutMs?: number;
}

export class AwsSnsProvider implements OtpProvider {
  readonly id: string;
  readonly channel = 'sms' as const;

  constructor(private readonly options: AwsSnsProviderOptions) {
    const c = options.credentials;
    if (!c.accessKeyId || !c.secretAccessKey || !options.region) {
      throw new Error('AwsSnsProvider requires AWS accessKeyId, secretAccessKey and region');
    }
    this.id = options.id ?? 'aws-sns';
  }

  private buildRequest(
    params: OtpSendParams,
    action: 'Publish' | 'GetSMSAttributes',
  ): {
    url: string;
    headers: Record<string, string>;
    body: string;
  } {
    const { accessKeyId, secretAccessKey, sessionToken } = this.options.credentials;
    const region = this.options.region;
    const host = `sns.${region}.amazonaws.com`;
    const path = '/';

    const body =
      action === 'Publish'
        ? awsFormBody({
            Action: 'Publish',
            Version: '2010-03-31',
            PhoneNumber: params.to,
            Message: `Your PEZHWAN verification code is ${params.code}`,
            'MessageAttributes.entry.1.Name': 'AWS.SNS.SMS.SMSType',
            'MessageAttributes.entry.1.Value.DataType': 'String',
            'MessageAttributes.entry.1.Value.StringValue': this.options.smsType ?? 'Transactional',
          })
        : awsFormBody({
            Action: 'GetSMSAttributes',
            Version: '2010-03-31',
          });

    const signed = signAwsSigV4(
      { accessKeyId, secretAccessKey, sessionToken, region, service: 'sns' },
      { method: 'POST', host, path, requestPayload: body },
    );

    return {
      url: `https://${host}${path}`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Authorization: signed.authorization,
        'X-Amz-Date': signed['x-amz-date'],
        'X-Amz-Content-Sha256': signed['x-amz-content-sha256'],
        ...(signed['x-amz-security-token']
          ? { 'X-Amz-Security-Token': signed['x-amz-security-token'] }
          : {}),
      },
      body,
    };
  }

  async sendSms(params: OtpSendParams): Promise<DeliveryResult> {
    const started = Date.now();
    try {
      const req = this.buildRequest(params, 'Publish');
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
        error: `SNS rejected with ${res.statusCode}: ${text.slice(0, 300)}`,
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
      // A lightweight, authenticated GetSMSAttributes call confirms the
      // credentials/region are valid and the SNS API is reachable without
      // publishing anything.
      const req = this.buildRequest({ to: '', code: '' }, 'GetSMSAttributes');
      const res = await callHttp({
        url: req.url,
        method: 'POST',
        headers: req.headers,
        body: req.body,
        timeoutMs: this.options.timeoutMs,
      });
      return {
        ok: res.statusCode >= 200 && res.statusCode < 300,
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
