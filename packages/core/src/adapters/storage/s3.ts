/**
 * PEZHWAN — AWS S3 storage adapter.
 *
 * Minimal S3 object storage client using AWS Signature V4 over `fetch`.
 * Supports GET/PUT/HEAD/DELETE and stream-less byte payloads.
 */

import { createHmac, createHash } from 'node:crypto';

export interface S3Options {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export interface S3ObjectMeta {
  key: string;
  size: number;
  etag?: string;
  contentType?: string;
}

export class S3Adapter {
  private readonly client: S3ClientCore;

  constructor(options: S3Options) {
    this.client = new S3ClientCore(options);
  }

  async put(key: string, body: Buffer | Uint8Array | string, contentType = 'application/octet-stream'): Promise<void> {
    await this.client.request('PUT', key, { body, contentType });
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.client.request('GET', key, {});
    return new Uint8Array(await response.arrayBuffer());
  }

  async exists(key: string): Promise<boolean> {
    const response = await this.client.request('HEAD', key, {});
    return response.status === 200;
  }

  async stat(key: string): Promise<S3ObjectMeta | null> {
    const response = await this.client.request('HEAD', key, {});
    if (response.status === 404) return null;
    return {
      key,
      size: Number(response.headers.get('content-length') ?? 0),
      etag: response.headers.get('etag') ?? undefined,
      contentType: response.headers.get('content-type') ?? undefined,
    };
  }

  async remove(key: string): Promise<void> {
    await this.client.request('DELETE', key, {});
  }

  async list(prefix: string, maxKeys = 1000): Promise<string[]> {
    const response = await this.client.request('GET', `?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=${maxKeys}`, {
      listStyle: true,
    });
    const text = await response.text();
    const keys = [...text.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1] ?? '');
    return keys;
  }
}

class S3ClientCore {
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: S3Options) {
    this.region = options.region;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.bucket = options.bucket;
    this.endpoint = options.endpoint ?? `https://s3.${options.region}.amazonaws.com`;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async request(
    method: string,
    keyOrQuery: string,
    input: { body?: Buffer | Uint8Array | string; contentType?: string; listStyle?: boolean },
  ): Promise<Response> {
    const payload = input.body ?? '';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const path = input.listStyle ? '/' : `/${encodeURIComponent(this.bucket)}/${keyOrQuery.split('/').map(encodeURIComponent).join('/')}`;
    const query = input.listStyle ? keyOrQuery.slice(1) : '';

    const headers: Record<string, string> = {
      host: new URL(this.endpoint).host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': sha256Hex(payload),
    };
    if (input.contentType) headers['content-type'] = input.contentType;

    const signedHeaders = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort()
      .join(';');

    const canonicalHeaders =
      Object.entries(headers)
        .map(([k, v]) => `${k.toLowerCase()}:${v.trim()}\n`)
        .sort()
        .join('') + '\n';

    const canonicalRequest = [
      method,
      path,
      query,
      canonicalHeaders,
      signedHeaders,
      sha256Hex(payload),
    ].join('\n');

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.secretAccessKey}`, dateStamp), this.region), 's3'),
      'aws4_request',
    );
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    headers.Authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const url = new URL(this.endpoint);
    url.pathname = path;
    url.search = query;
    return this.fetchImpl(url.toString(), {
      method,
      headers,
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: payload }),
    });
  }
}

function sha256Hex(value: string | Buffer | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}