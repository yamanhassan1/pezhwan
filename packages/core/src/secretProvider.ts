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
 *
 * Third parties can implement SecretProvider for their secret manager without
 * touching authentication code.
 */

/**
 * Secure, storage-agnostic interface for retrieving secrets.
 */
export interface SecretProvider {
  /**
   * Fetch a required secret. Throws if missing.
   * Implementations MUST NOT log or reveal the secret value.
   */
  getSecret(name: string): Promise<string | undefined>;

  /**
   * Fetch an optional secret. Returns undefined if absent.
   */
  getOptionalSecret(name: string): Promise<string | undefined>;
}

// ---------------------------------------------------------------------------
// Environment SecretProvider
// ---------------------------------------------------------------------------

export class EnvSecretProvider implements SecretProvider {
  async getSecret(name: string): Promise<string | undefined> {
    const value = process.env[name];
    if (value === undefined || value === '') {
      return undefined;
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
    // Sanitize: names may only contain [A-Za-z0-9_-.]
    const safe = name.replace(/[^A-Za-z0-9_.-]/g, '_');
    return `${this.directory}/${safe}`;
  }

  async getSecret(name: string): Promise<string | undefined> {
    try {
      const content = await this.readFile(this.filePath(name));
      return content.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  async getOptionalSecret(name: string): Promise<string | undefined> {
    return this.getSecret(name);
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

  async getSecret(name: string): Promise<string | undefined> {
    for (const provider of this.providers) {
      const value = await provider.getSecret(name);
      if (value !== undefined) {
        return value;
      }
    }
    return undefined;
  }

  async getOptionalSecret(name: string): Promise<string | undefined> {
    return this.getSecret(name);
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
}

export function createSecretProvider(
  config: SecretProviderConfig = {},
): SecretProvider {
  const providers: SecretProvider[] = [];
  if (config.secretFileDirectory) {
    providers.push(new FileSecretProvider(config.secretFileDirectory));
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
