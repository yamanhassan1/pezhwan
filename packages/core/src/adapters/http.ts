/**
 * PEZHWAN — small HTTP + AWS SigV4 helpers for REST OTP transports.
 *
 * Providers (SendGrid, Twilio, AWS SES/SNS, ...) are called over plain HTTPS
 * with the platform's global `fetch`, so they carry no heavy vendor SDK
 * dependency. This module provides:
 *
 *   - postJson() / callJson(): fetch wrapper with timeout and JSON parsing
 *   - signAwsSigV4(): minimal AWS Signature Version 4 request signer used by
 *     SES (SendEmail) and SNS (Publish) — enough for X.509-less REST calls.
 *
 * All secrets are supplied by the caller (provider options), never here.
 */

import { createHmac, createHash } from 'node:crypto';

export interface HttpCallOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  /** Overall request timeout in ms. Default 8000. */
  timeoutMs?: number;
}

export interface HttpResponse {
  statusCode: number;
  body: string;
}

/** Perform an HTTP request with a timeout. Never throws on HTTP status. */
export async function callHttp(opts: HttpCallOptions): Promise<HttpResponse> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(opts.url, {
      method: opts.method ?? 'POST',
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal,
    });
    const text = await res.text();
    return { statusCode: res.status, body: text };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse a response body as JSON, tolerating empty/passthrough bodies. */
export function parseJsonBody<T = Record<string, unknown>>(
  res: HttpResponse,
): { json?: T; text: string } {
  try {
    return { json: (res.body ? JSON.parse(res.body) : undefined) as T, text: res.body };
  } catch {
    return { text: res.body };
  }
}

// ---------------------------------------------------------------------------
// AWS Signature Version 4 (SigV4)
// ---------------------------------------------------------------------------

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
  service: 'ses' | 'sns' | 'lambda' | string;
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** Build the canonical + signed request headers per SigV4. */
export function signAwsSigV4(
  creds: AwsCredentials,
  opts: { method: string; host: string; path: string; query?: string; requestPayload: string },
): {
  authorization: string;
  host: string;
  'x-amz-date': string;
  'x-amz-security-token'?: string;
  'x-amz-content-sha256': string;
} {
  const { method, host, path, query = '', requestPayload } = opts;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256(requestPayload);

  const canonicalHeaders = [`host:${host}`, `x-amz-date:${amzDate}`];
  if (creds.sessionToken) {
    canonicalHeaders.push(`x-amz-security-token:${creds.sessionToken}`);
  }
  const signedHeaderNames = creds.sessionToken
    ? 'host;x-amz-date;x-amz-security-token'
    : 'host;x-amz-date';

  const canonicalRequest = [
    method,
    path,
    query,
    canonicalHeaders.join('\n'),
    '',
    signedHeaderNames,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${creds.region}/${creds.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, creds.region);
  const kService = hmac(kRegion, creds.service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign).toString('hex');

  return {
    authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`,
    host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    ...(creds.sessionToken ? { 'x-amz-security-token': creds.sessionToken } : {}),
  };
}

/** Make a signed AWS request body ready for the REST API (form-encoded params). */
export function awsFormBody(params: Record<string, string | undefined>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined)
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k] as string)}`)
    .sort()
    .join('&');
}
