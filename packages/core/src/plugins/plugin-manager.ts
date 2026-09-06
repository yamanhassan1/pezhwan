/**
 * PEZHWAN — Plugin manager.
 *
 * Owns plugin lifecycle: discovery (via loader), registration of hooks into
 * the hook bus, enable/disable, and unload. Failed plugins are quarantined
 * with their last error attached.
 */

import type { Hooks } from './hooks.ts';
import type { PluginLoader, LoadedPlugin, PluginManifest } from './plugin-loader.ts';

export interface PluginStatus extends LoadedPlugin {
  state: 'active' | 'disabled' | 'error';
  lastError?: string;
}

export class PluginManager {
  private readonly statuses = new Map<string, PluginStatus>();
  private loadedPlugins = new Map<string, LoadedPlugin>();

  constructor(
    private readonly loader: PluginLoader,
    private readonly hooks: Hooks,
  ) {}

  async load(mult: PluginManifest): Promise<PluginStatus> {
    try {
      const loaded = await this.loader.load(mult);
      this.loadedPlugins.set(mult.name, loaded);
      const status: PluginStatus = {
        ...loaded,
        state: mult.enabled === false ? 'disabled' : 'active',
      };
      this.statuses.set(mult.name, status);
      if (status.state === 'active') this.activateHooks(status);
      return status;
    } catch (cause) {
      const broken: PluginStatus = {
        manifest: mult,
        exports: null,
        hooks: undefined,
        state: 'error',
        lastError: cause instanceof Error ? cause.message : String(cause),
      };
      this.statuses.set(mult.name, broken);
      return broken;
    }
  }

  private activateHooks(status: PluginStatus): void {
    const exports = status.exports;
    if (!exports || typeof exports !== 'object') return;
    const candidate = (exports as { hooks?: Record<string, unknown> }).hooks;
    if (!candidate || typeof candidate !== 'object') return;
    for (const [hookName, handler] of Object.entries(candidate)) {
      if (typeof handler === 'function') {
        this.hooks.register(hookName, handler as (context: unknown) => void);
      }
    }
  }

  async enable(name: string): Promise<PluginStatus | undefined> {
    const status = this.statuses.get(name);
    if (!status) return undefined;
    if (status.state !== 'active') {
      const fresh = this.loadedPlugins.get(name);
      if (fresh) {
        status.exports = fresh.exports;
        status.hooks = fresh.hooks;
        this.activateHooks(status);
      }
      status.state = 'active';
      status.lastError = undefined;
    }
    return status;
  }

  async disable(name: string): Promise<PluginStatus | undefined> {
    const status = this.statuses.get(name);
    if (status) status.state = 'disabled';
    return status;
  }

  list(): PluginStatus[] {
    return [...this.statuses.values()];
  }

  get(name: string): PluginStatus | undefined {
    return this.statuses.get(name);
  }
}