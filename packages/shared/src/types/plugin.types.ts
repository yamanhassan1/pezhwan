/**
 * PEZHWAN — plugin/extension point types.
 */

/** A pluggable capability module (providers, hooks, middlewares). */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  /** Capabilities provided, e.g. \"[\'email-provider\', \'captcha-provider\']\". */
  provides: string[];
}

/** Runtime context handed to a plugin during initialization. */
export interface PluginContext {
  tenantId?: string;
  applicationId?: string;
  /** Injected settings/config store. */
  config?: Record<string, unknown>;
}

/** Result of initialising a plugin. */
export interface PluginRegistrationResult {
  name: string;
  loaded: boolean;
  error?: string;
}
