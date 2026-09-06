/**
 * PEZHWAN — Developer plugin-manager service.
 *
 * Registry of developer-installed plugins with their declared metadata,
 * lifecycle state, and last health check. Actual plugin execution is owned by
 * the runtime plugin manager (./plugins); this service is the developer-facing
 * inventory/audit view.
 */

import { randomUUID } from 'node:crypto';

export type PluginLifecycle = 'installed' | 'enabled' | 'disabled' | 'error';

export interface DeveloperPluginRecord {
  id: string;
  name: string;
  version: string;
  entryPoint: string;
  state: PluginLifecycle;
  installedBy: string;
  installedAt: string;
  lastError?: string;
}

const DEFAULT_PLACEHOLDER: DeveloperPluginRecord = {
  id: '',
  name: 'core-engine',
  version: '0.1.0',
  entryPoint: 'builtin',
  state: 'enabled',
  installedBy: 'system',
  installedAt: '',
};

export class DeveloperPluginManagerService {
  private readonly plugins = new Map<string, DeveloperPluginRecord>();

  async install(input: {
    name: string;
    version: string;
    entryPoint: string;
    installedBy: string;
  }): Promise<DeveloperPluginRecord> {
    if (this.plugins.has(input.name)) {
      return this.plugins.get(input.name) as DeveloperPluginRecord;
    }
    const record: DeveloperPluginRecord = {
      ...DEFAULT_PLACEHOLDER,
      id: randomUUID(),
      name: input.name,
      version: input.version,
      entryPoint: input.entryPoint,
      installedBy: input.installedBy,
      installedAt: new Date().toISOString(),
    };
    this.plugins.set(input.name, record);
    return record;
  }

  async setState(name: string, state: PluginLifecycle, lastError?: string): Promise<DeveloperPluginRecord | null> {
    const record = this.plugins.get(name);
    if (!record) return null;
    record.state = state;
    if (lastError !== undefined) record.lastError = lastError;
    return record;
  }

  async list(): Promise<DeveloperPluginRecord[]> {
    return [...this.plugins.values()];
  }

  async get(name: string): Promise<DeveloperPluginRecord | null> {
    return this.plugins.get(name) ?? null;
  }

  async uninstall(name: string): Promise<boolean> {
    return this.plugins.delete(name);
  }
}