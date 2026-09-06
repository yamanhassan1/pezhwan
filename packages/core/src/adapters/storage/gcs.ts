/**
 * PEZHWAN — Google Cloud Storage adapter.
 *
 * GCS JSON API client with OAuth2 access-token authentication over `fetch`.
 * The caller supplies an access token (e.g. from the metadata server or a
 * service-account JWT exchange).
 */

export interface GcsOptions {
  bucket: string;
  accessToken: string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
}

export interface GcsObjectMeta {
  name: string;
  size: number;
  contentType?: string;
  etag?: string;
  updated?: string;
}

interface GcsListResponse {
  items?: Array<{ name: string }>;
}

export class GcsAdapter {
  private readonly bucket: string;
  private readonly accessToken: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GcsOptions) {
    this.bucket = options.bucket;
    this.accessToken = options.accessToken;
    this.endpoint = options.endpoint ?? 'https://storage.googleapis.com/storage/v1';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  private url(object?: string): string {
    const base = `${this.endpoint}/b/${this.bucket}/o`;
    return object ? `${base}/${encodeURIComponent(object)}` : base;
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  async put(name: string, body: Uint8Array | string, contentType = 'application/octet-stream'): Promise<void> {
    const payload = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    const response = await this.fetchImpl(this.url(name), {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': contentType,
      },
      body: payload,
    });
    if (!response.ok) throw new Error(`GCS upload failed: ${response.status}`);
  }

  async get(name: string): Promise<Uint8Array> {
    const response = await this.fetchImpl(this.url(name) + '?alt=media', {
      method: 'GET',
      headers: this.headers(),
    });
    if (response.status === 404) throw new Error(`GCS object not found: ${name}`);
    if (!response.ok) throw new Error(`GCS download failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async exists(name: string): Promise<boolean> {
    const response = await this.fetchImpl(this.url(name), {
      method: 'GET',
      headers: this.headers(),
    });
    return response.status === 200;
  }

  async stat(name: string): Promise<GcsObjectMeta | null> {
    const response = await this.fetchImpl(this.url(name), {
      method: 'GET',
      headers: this.headers(),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GCS stat failed: ${response.status}`);
    const data = (await response.json()) as GcsObjectMeta;
    data.name = name;
    return data;
  }

  async remove(name: string): Promise<void> {
    await this.fetchImpl(this.url(name), {
      method: 'DELETE',
      headers: this.headers(),
    });
  }

  async list(prefix: string): Promise<string[]> {
    const response = await this.fetchImpl(`${this.url()}?prefix=${encodeURIComponent(prefix)}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!response.ok) throw new Error(`GCS list failed: ${response.status}`);
    const data = (await response.json()) as GcsListResponse;
    return (data.items ?? []).map((item) => item.name ?? '');
  }
}