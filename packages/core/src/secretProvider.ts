/**
 * PEZHWAN — SecretProvider abstraction.
 *
 * An interface for retrieving secrets independent of the underlying storage
 * mechanism. This lets the application read secrets from:
 *   - Environment variables (development)
 *   - Mounted secret files (Docker/Kubernetes)
 *   - Cloud Secret Managers (AWS Secrets Manager, Google Secret Manager,
 *     Azure Key Vault, HashiCorp Vault, etc.)
 *
 * The authentication logic never knows (or cares) where a secret comes from —
 * it only asks `getSecret(name)` / `getOptionalSecret(name)`.
 *
 * Implementations provided here:
 *   - EnvSecretProvider   — reads from process.env (dev / simple prod)
 *   - FileSecretProvider  — reads from a mounted secret file (Docker/K8s)
 *   - ChainSecretProvider — tries multiple providers in order
 *   - VaultSecretProvider — HashiCorp Vault KV (v1/v2) over HTTP, token or
 *                           AppRole auth, zero-dependency via injected fetch
 *   - AwsSecretsManagerProvider — AWS Secrets Manager over HTTP, SigV4 signed
 *                           requests, zero-dependency via injected fetch
 *
 * Third parties can implement SecretProvider for their secret manager without
 * touching authentication code.
 */

import { createHash, createHmac } from 'node:crypto';

/**
 * Secure, storage-agnostic interface for retrieving secrets.
 */
export interface SecretProvider {
  /**
   * Fetch a required secret. Throws if missing.
   * Implementations MUST NOT log or reveal the secret value.
   */
  getSecret(name: string): Promise<string>;

  /**
   * Fetch an optional secret. Returns undefined if absent.
   */
  getOptionalSecret(name: string): Promise<string | undefined>;
}

export class SecretNotFoundError extends Error {
  constructor(public readonly secretName: string) {
    super(`Required secret "${secretName}" was not found`);
    this.name = 'SecretNotFoundError';
  }
}

// ---------------------------------------------------------------------------
// Environment SecretProvider
// ---------------------------------------------------------------------------

export class EnvSecretProvider implements SecretProvider {
  async getSecret(name: string): Promise<string> {
    const value = await this.getOptionalSecret(name);
    if (value === undefined) {
      throw new SecretNotFoundError(name);
    }
    return value;
  }

  async getOptionalSecret(name: string): Promise<string | undefined> {
    const value = process.env[name];
    if (value === undefined || value === '') {
      return undefined;
    }
    return value;
  }
}

// ---------------------------------------------------------------------------
// File SecretProvider (Docker/Kubernetes mounted secrets)
// ---------------------------------------------------------------------------

export class FileSecretProvider implements SecretProvider {
  constructor(
    private readonly directory: string,
    private readonly readFile: (path: string) => Promise<string> = async (p) =>
      (await import('node:fs/promises')).readFile(p, 'utf-8'),
  ) {}

  private filePath(name: string): string {
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || name === '.' || name === '..') {
      throw new Error(`Invalid secret name "${name}"`);
    }
    return `${this.directory}/${name}`;
  }

  async getSecret(name: string): Promise<string> {
    const value = await this.getOptionalSecret(name);
    if (value === undefined) {
      throw new SecretNotFoundError(name);
    }
    return value;
  }

  async getOptionalSecret(name: string): Promise<string | undefined> {
    try {
      const content = await this.readFile(this.filePath(name));
      return content.trim() || undefined;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Chain SecretProvider — try providers in order
// ---------------------------------------------------------------------------

export class ChainSecretProvider implements SecretProvider {
  constructor(private readonly providers: SecretProvider[]) {
    if (providers.length === 0) {
      throw new Error('ChainSecretProvider requires at least one provider');
    }
  }

  async getSecret(name: string): Promise<string> {
    for (const provider of this.providers) {
      const value = await provider.getOptionalSecret(name);
      if (value !== undefined) {
        return value;
      }
    }
    throw new SecretNotFoundError(name);
  }

  async getOptionalSecret(name: string): Promise<string | undefined> {
    for (const provider of this.providers) {
      const value = await provider.getOptionalSecret(name);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

export interface SecretProviderConfig {
  /** Environment provider always included as the last fallback. */
  env?: boolean;
  /** Optional directory of mounted secret files (checked first if set). */
  secretFileDirectory?: string;
  /** Optional HashiCorp Vault provider (checked after files, before env). */
  vault?: VaultSecretProviderOptions;
  /** Optional AWS Secrets Manager provider (checked after files, before env). */
  aws?: AwsSecretsManagerOptions;
}

export function createSecretProvider(config: SecretProviderConfig = {}): SecretProvider {
  const providers: SecretProvider[] = [];
  if (config.secretFileDirectory) {
    providers.push(new FileSecretProvider(config.secretFileDirectory));
  }
  if (config.vault) {
    providers.push(new VaultSecretProvider(config.vault));
  }
  if (config.aws) {
    providers.push(new AwsSecretsManagerProvider(config.aws));
  }
  if (config.env !== false) {
    providers.push(new EnvSecretProvider());
  }
  return new ChainSecretProvider(providers);
}

/**
 * Minimal sync variant for consumers that cannot await at import time.
 * Reads directly from process.env (same contract as EnvSecretProvider).
 */
export function getSecretSync(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

// ---------------------------------------------------------------------------
// HashiCorp Vault SecretProvider (KV v1 / v2 over HTTP)
// ---------------------------------------------------------------------------

export interface VaultSecretProviderOptions {
  /** Vault base URL, e.g. https://vault.example.com:8200 (no trailing slash). */
  baseUrl: string;
  /** Static token. When absent, AppRole login is attempted first. */
  token?: string;
  /** AppRole authentication — used to obtain a client token when `token` is unset. */
  roleId?: string;
  /** AppRole authentication secret ID. */
  secretId?: string;
  /** KV mount path (default "secret"). */
  mountPath?: string;
  /** KV engine version: 1 or 2 (default 2 — the data/ prefix layout). */
  kvVersion?: 1 | 2;
  /** Injected fetch for testability (default: globalThis.fetch). */
  fetchImpl?: typeof fetch;
}

/**
 * HashiCorp Vault SecretProvider over the KV HTTP API (zero SDK dependency).
 *
 * - KV v2:    GET {base}/v1/{mount}/data/{name} → { data: { data: {…} } }
 * - KV v1:    GET {base}/v1/{mount}/{name}      → { data: {…} }
 *
 * A stored secret is expected to be one of:
 *   1. a field named after the final path segment of `name`;
 *   2. a single-key field (i.e. the whole map is the secret's value);
 *   3. the well-known keys `value` or `secret`.
 * Resolution order is 1 → 3 → 2. Anything else is `SecretNotFoundError`.
 *
 * Auth: a static `token` wins; otherwise AppRole `{role_id, secret_id}` is
 * exchanged for a client token via POST /v1/auth/approle/login. Never logs the
 * token or secret values.
 */
export class VaultSecretProvider implements SecretProvider {
  private readonly baseUrl: string;
  private readonly mountPath: string;
  private readonly kvVersion: 1 | 2;
  private readonly fetchImpl: typeof fetch;
  private readonly roleId: string | undefined;
  private readonly secretId: string | undefined;
  private cachedToken: string | undefined;

  constructor(options: VaultSecretProviderOptions) {
    if (!options || typeof options.baseUrl !== 'string' || options.baseUrl.length === 0) {
      throw new Error('VaultSecretProvider requires a baseUrl');
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.mountPath = (options.mountPath ?? 'secret').replace(/^\/+|\/+$/g, '');
    this.kvVersion = options.kvVersion ?? 2;
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.cachedToken = options.token;
    this.roleId = options.roleId;
    this.secretId = options.secretId;
  }

  private async ensureToken(): Promise<string> {
    if (this.cachedToken) {
      return this.cachedToken;
    }
    if (this.roleId && this.secretId) {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/auth/approle/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: this.roleId, secret_id: this.secretId }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Vault AppRole login failed (${res.status})`);
      }
      const body = (await res.json()) as { auth?: { client_token?: string } };
      if (!body.auth?.client_token) {
        throw new Error('Vault AppRole login returned no client token');
      }
      this.cachedToken = body.auth.client_token;
      return this.cachedToken;
    }
    throw new Error('VaultSecretProvider requires a token or AppRole credentials');
  }

  async getSecret(name: string): Promise<string> {
    const value = await this.getOptionalSecret(name);
    if (value === undefined) {
      throw new SecretNotFoundError(name);
    }
    return value;
  }

  async getOptionalSecret(name: string): Promise<string | undefined> {
    if (!/^[A-Za-z0-9._/-]+$/.test(name) || name.startsWith('/') || name.endsWith('/')) {
      throw new Error(`Invalid Vault secret name "${name}"`);
    }
    const token = await this.ensureToken();
    const encoded = name
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const dataPath =
      this.kvVersion === 2 ? `${this.mountPath}/data/${encoded}` : `${this.mountPath}/${encoded}`;
    const res = await this.fetchImpl(`${this.baseUrl}/v1/${dataPath}`, {
      method: 'GET',
      headers: { 'X-Vault-Token': token },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) {
      return undefined;
    }
    if (!res.ok) {
      throw new Error(`Vault read failed (${res.status})`);
    }
    const body = (await res.json()) as {
      data?: unknown;
    };
    const map =
      this.kvVersion === 2
        ? ((body.data as { data?: Record<string, unknown> } | undefined)?.data ?? {})
        : ((body.data as Record<string, unknown> | undefined) ?? {});
    const lastSegment = name.split('/').pop() ?? name;
    return this.resolveValue(map, lastSegment, name);
  }

  private resolveValue(
    map: Record<string, unknown>,
    lastSegment: string,
    name: string,
  ): string | undefined {
    if (typeof map[lastSegment] === 'string') {
      return map[lastSegment] as string;
    }
    if (typeof map.value === 'string') {
      return map.value;
    }
    if (typeof map.secret === 'string') {
      return map.secret;
    }
    const entries = Object.entries(map);
    if (entries.length === 1 && typeof entries[0]?.[1] === 'string') {
      return entries[0][1] as string;
    }
    if (entries.length === 0) {
      return undefined;
    }
    throw new Error(
      `Vault secret "${name}" has an unexpected shape; expose a string field (e.g. "value")`,
    );
  }
}

// ---------------------------------------------------------------------------
// AWS Secrets Manager SecretProvider (SigV4 over HTTP)
// ---------------------------------------------------------------------------

export interface AwsSecretsManagerOptions {
  /** AWS region (default: AWS_REGION | AWS_DEFAULT_REGION | us-east-1). */
  region?: string;
  /** Access key id (default: AWS_ACCESS_KEY_ID). */
  accessKeyId?: string;
  /** Secret access key (default: AWS_SECRET_ACCESS_KEY). */
  secretAccessKey?: string;
  /** Session token for temporary credentials (default: AWS_SESSION_TOKEN). */
  sessionToken?: string;
  /** Override endpoint (default: https://secretsmanager.{region}.amazonaws.com). */
  endpoint?: string;
  /** Injected fetch for testability (default: globalThis.fetch). */
  fetchImpl?: typeof fetch;
}

/**
 * AWS Secrets Manager SecretProvider over the JSON-RPC HTTP API, signing every
 * request with SigV4 (zero SDK dependency). Reads `SecretString` for the named
 * secret; a binary secret is returned UTF-8 decoded. A missing secret maps to
 * `SecretNotFoundError`; network/API failures surface as clear errors and are
 * never masked as "not found". Secret values are never logged.
 *
 * Credentials come from options or the standard `AWS_*` environment variables.
 */
export class AwsSecretsManagerProvider implements SecretProvider {
  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly sessionToken: string | undefined;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AwsSecretsManagerOptions = {}) {
    this.region =
      options.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
    this.accessKeyId = options.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID ?? '';
    this.secretAccessKey = options.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY ?? '';
    this.sessionToken = options.sessionToken ?? process.env.AWS_SESSION_TOKEN ?? undefined;
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error(
        'AwsSecretsManagerProvider requires access keys (options or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY)',
      );
    }
    this.endpoint = (
      options.endpoint ?? `https://secretsmanager.${this.region}.amazonaws.com`
    ).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch);
  }

  async getSecret(name: string): Promise<string> {
    const value = await this.getOptionalSecret(name);
    if (value === undefined) {
      throw new SecretNotFoundError(name);
    }
    return value;
  }

  async getOptionalSecret(name: string): Promise<string | undefined> {
    const body = JSON.stringify({ SecretId: name });
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const signed = this.sign('secretsmanager.GetSecretValue', body, amzDate);

    const res = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'secretsmanager.GetSecretValue',
        'X-Amz-Date': amzDate,
        ...(this.sessionToken ? { 'X-Amz-Security-Token': this.sessionToken } : {}),
        Authorization: signed.authorization,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const payload = (await res.json()) as { SecretString?: string; SecretBinary?: string };
      if (typeof payload.SecretString === 'string') {
        return payload.SecretString;
      }
      if (typeof payload.SecretBinary === 'string') {
        return Buffer.from(payload.SecretBinary, 'base64').toString('utf-8');
      }
      return undefined;
    }

    const errorBody = (await res.json().catch(() => ({}))) as { __type?: string };
    if (errorBody.__type?.endsWith('ResourceNotFoundException')) {
      return undefined;
    }
    throw new Error(
      `AWS Secrets Manager request failed (${res.status}${errorBody.__type ? ` ${errorBody.__type}` : ''})`,
    );
  }

  /** AWS Signature Version 4 for the Secrets Manager JSON-RPC API. */
  private sign(target: string, body: string, amzDate: string): { authorization: string } {
    const dateStamp = amzDate.slice(0, 8);
    const service = 'secretsmanager';
    const scope = `${dateStamp}/${this.region}/${service}/aws4_request`;
    const shortHost = this.endpoint.replace(/^https?:\/\//, '');

    const payloadHash = createSha256Hex(body);
    const headers: Record<string, string> = {
      'content-type': 'application/x-amz-json-1.1',
      host: shortHost,
      'x-amz-date': amzDate,
      'x-amz-target': target,
    };
    if (this.sessionToken) {
      headers['x-amz-security-token'] = this.sessionToken;
    }
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames
      .map((h) => `${h}:${this.trimAll(headers[h]!)}\n`)
      .join('');
    const canonicalRequest = [
      'POST',
      '/',
      '',
      canonicalHeaders,
      signedHeaderNames.join(';'),
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createSha256Hex(canonicalRequest),
    ].join('\n');

    const dateKey = createHmacSha256(`AWS4${this.secretAccessKey}`, dateStamp);
    const regionKey = createHmacSha256(dateKey, this.region);
    const serviceKey = createHmacSha256(regionKey, service);
    const signingKey = createHmacSha256(serviceKey, 'aws4_request');
    const signature = createHmacSha256Hex(signingKey, stringToSign);

    const credential = `${this.accessKeyId}/${scope}`;
    return {
      authorization: `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`,
    };
  }

  private trimAll(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }
}

function createSha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function createHmacSha256(key: string | Uint8Array, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function createHmacSha256Hex(key: Buffer, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}
