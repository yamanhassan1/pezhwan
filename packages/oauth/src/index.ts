/**
 * PEZHWAN — @pezhwan/oauth package entry point.
 *
 * Modular external identity-provider adapters (Google, Apple, GitHub,
 * Microsoft, enterprise IdP, ...) + the ProviderRegistry that keeps the core
 * auth engine provider-agnostic.
 */

export * from './adapter.ts';
export * from './registry.ts';
export * from './providers/google.ts';
export * from './providers/apple.ts';
export * from './providers/github.ts';
export * from './providers/microsoft.ts';

export * from './pkce.ts';
export * from './authorization-code.ts';
export * from './oauth.service.ts';
export * from './oidc.service.ts';
export * from './token-exchange.ts';
export * from './federation/index.ts';
export * from './providers/index.ts';
export * from './scim/index.ts';

import { GoogleProvider } from './providers/google.ts';
import { AppleProvider } from './providers/apple.ts';
import { GitHubProvider } from './providers/github.ts';
import { MicrosoftProvider } from './providers/microsoft.ts';
import { ProviderRegistry } from './registry.ts';
import type { OAuthProviderAdapter } from './adapter.ts';

/** Convenience: build a registry pre-loaded with the built-in providers. */
export function createBuiltinRegistry(config: Array<OAuthProviderAdapter>): ProviderRegistry {
  return new ProviderRegistry(config);
}

export { GoogleProvider, AppleProvider, GitHubProvider, MicrosoftProvider, ProviderRegistry };
