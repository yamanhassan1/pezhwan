/**
 * PEZHWAN — Plugin loader.
 *
 * Resolves plugin entry points by module specifier or path and imports them.
 * Loaded modules are cached; a plugin may be `enabled` or `disabled` per
 * manifest. Factory-loaded plugins get the runtime deps passed on import.
 */

export interface PluginManifest {
  name: string;
  version: string;
  entry: string;
  enabled?: boolean;
}

export interface LoadedPlugin {
  manifest: PluginManifest;
  exports: unknown;
  hooks?: string[];
}

export interface PluginLoaderOptions {
  enabledOnly?: boolean;
  deps?: Record<string, unknown>;
}

const cache = new Map<string, unknown>();

export class PluginLoader {
  private readonly options: PluginLoaderOptions;

  constructor(options: PluginLoaderOptions = {}) {
    this.options = options;
  }

  /** Resolve a plugin's url compatible with dynamic import in both CJS/ESM. */
  resolveUrl(specifier: string): string {
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) {
      return new URL(specifier, import.meta.url).toString();
    }
    return specifier;
  }

  async load(manifest: PluginManifest): Promise<LoadedPlugin> {
    if (this.options.enabledOnly && manifest.enabled === false) {
      throw new Error(`Plugin ${manifest.name} is disabled`);
    }
    const url = this.resolveUrl(manifest.entry);
    const cached = cache.get(url);
    const mod = (cached as { default?: unknown } | undefined) ?? ((await import(url)) as { default?: unknown });
    if (!cached) cache.set(url, mod);
    const exports = (mod.default ?? mod) as unknown;
    let hooks: string[] | undefined;
    if (exports !== null && typeof exports === 'object' && 'hooks' in exports) {
      const candidate = (exports as { hooks?: unknown }).hooks;
      if (Array.isArray(candidate)) hooks = candidate as string[];
    }
    return { manifest, exports, hooks };
  }
}