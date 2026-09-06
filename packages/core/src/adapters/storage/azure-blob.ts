/**
 * PEZHWAN — Azure Blob storage adapter.
 *
 * Azure Storage Blob client with Shared Key authentication over `fetch`.
 * Supports put/get/head/delete. STS (2019-12-12) versioning used for headers.
 */

import { createHmac } from 'node:crypto';

export interface AzureBlobOptions {
  account: string;
  accountKey: string;
  container: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export interface AzureBlobMeta {
  name: string;
  size: number;
  contentType?: string;
  etag?: string;
}

export class AzureBlobAdapter {
  private readonly account: string;
  private readonly accountKey: string;
  private readonly container: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AzureBlobOptions) {
    this.account = options.account;
    this.accountKey = options.accountKey;
    this.container = options.container;
    this.endpoint = options.endpoint ?? `https://${options.account}.blob.core.windows.net`;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private resource(blob: string): string {
    return `/${this.container}/${blob}`;
  }

  private async request(method: string, blob: string, body?: Uint8Array, contentType?: string): Promise<Response> {
    const now = new Date().toUTCString();
    const path = encodeURI(this.resource(blob));
    const canonical = `${method}\n\n\n${contentType ?? ''}\n\n\n\n\n\n\n\n\nx-ms-blob-type:BlockBlob\nx-ms-date:${now}\nx-ms-version:2019-12-12\n${this.resource(blob)}`;
    const signature = createHmac('sha256', Buffer.from(this.accountKey, 'base64'))
      .update(canonical)
      .digest('base64');
    const headers: Record<string, string> = {
      'x-ms-date': now,
      'x-ms-version': '2019-12-12',
      Authorization: `SharedKey ${this.account}:${signature}`,
    };
    if (method === 'PUT') {
      headers['x-ms-blob-type'] = 'BlockBlob';
      if (contentType) headers['content-type'] = contentType;
    }
    return this.fetchImpl(`${this.endpoint}${path}`, {
      method,
      headers,
      ...(body ? { body } : {}),
    });
  }

  async put(name: string, body: Uint8Array | string, contentType = 'application/octet-stream'): Promise<void> {
    const payload = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    const response = await this.request('PUT', name, payload, contentType);
    if (response.status >= 300) throw new Error(`Azure blob put failed: ${response.status}`);
  }

  async get(name: string): Promise<Uint8Array> {
    const response = await this.request('GET', name);
    if (response.status === 404) throw new Error(`Azure blob not found: ${name}`);
    if (!response.ok) throw new Error(`Azure blob get failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async exists(name: string): Promise<boolean> {
    const response = await this.request('HEAD', name);
    return response.status === 200;
  }

  async stat(name: string): Promise<AzureBlobMeta | null> {
    const response = await this.request('HEAD', name);
    if (response.status === 404) return null;
    return {
      name,
      size: Number(response.headers.get('content-length') ?? 0),
      contentType: response.headers.get('content-type') ?? undefined,
      etag: response.headers.get('etag') ?? undefined,
    };
  }

  async remove(name: string): Promise<void> {
    await this.request('DELETE', name);
  }
}