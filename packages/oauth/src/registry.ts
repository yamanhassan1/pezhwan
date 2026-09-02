/**
 * PEZHWAN — provider registry.
 *
 * A named map of OAuthProviderAdapter implementations. Keeps the core auth
 * engine provider-agnostic: the engine asks the registry for a provider by
 * name ('google' | 'apple' | 'github' | 'microsoft' | '<enterprise-idp>').
 * Unknown names throw a ProviderError rather than being silently ignored.
 */

import { ProviderError } from '@pezhwan/shared';
import type { OAuthProviderAdapter } from './adapter.ts';

export class ProviderRegistry {
  private readonly adapters = new Map<string, OAuthProviderAdapter>();

  constructor(adapters: OAuthProviderAdapter[] = []) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  register(adapter: OAuthProviderAdapter): void {
    if (!adapter?.name) {
      throw new Error('A provider adapter must have a name');
    }
    if (this.adapters.has(adapter.name)) {
      throw new Error(`A provider named "${adapter.name}" is already registered`);
    }
    this.adapters.set(adapter.name, adapter);
  }

  get(name: string): OAuthProviderAdapter {
    const adapter = this.adapters.get(name);
    if (!adapter) {
      throw new ProviderError(
        `OAuth provider "${name}" is not configured`,
        'PROVIDER_NOT_CONFIGURED',
      );
    }
    return adapter;
  }

  has(name: string): boolean {
    return this.adapters.has(name);
  }

  names(): string[] {
    return [...this.adapters.keys()];
  }
}