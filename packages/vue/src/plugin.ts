/**
 * PEZHWAN — Vue 3 SDK plugin.
 *
 *   app.use(pezhwan, { baseUrl: 'https://api.example.com' })
 *
 * Installs the shared API configuration into every component tree and exposes
 * the composables through the package entry.
 */

import type { App, Plugin } from 'vue';
import { PEZHWAN_CONFIG, type PezhwanConfig } from './composables/useAuth';

export interface PezhwanPluginOptions {
  /** Base URL of the PEZHWAN API (e.g. https://api.example.com). */
  baseUrl: string;
}

let activeConfig: PezhwanConfig | null = null;

/** Resolve the current API config (thrown when the plugin is not installed). */
export function getActiveConfig(): PezhwanConfig {
  if (!activeConfig) {
    throw new Error('The pezhwan plugin is not installed (app.use(pezhwan, { baseUrl }))');
  }
  return activeConfig;
}

export const pezhwan: Plugin = {
  install(app: App, options?: PezhwanPluginOptions) {
    if (!options || typeof options.baseUrl !== 'string' || options.baseUrl.length === 0) {
      throw new Error('pezhwan plugin requires { baseUrl }');
    }
    activeConfig = { baseUrl: options.baseUrl };
    app.provide(PEZHWAN_CONFIG, activeConfig);
  },
};

/** Injected downstream of the plugin. */
export function usePezhwanConfig(): PezhwanConfig {
  return getActiveConfig();
}

export default pezhwan;