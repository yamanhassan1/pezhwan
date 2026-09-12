/**
 * PEZHWAN — typed runtime client.
 *
 * Wraps `createPezhwan` in an instance with typed accessors over every
 * subsystem (auth, sessions, authorization, MFA, OAuth, API keys, tokens,
 * metrics) so programmatic consumers get discoverable, self-documenting APIs.
 */

import { createPezhwan, type PezhwanConfig, type PezhwanRuntime } from '@pezhwan/core';

/** A constructed runtime client. */
export class RuntimeClient {
  readonly runtime: PezhwanRuntime;

  constructor(config: PezhwanConfig) {
    this.runtime = createPezhwan(config);
  }

  get auth() {
    return this.runtime.auth;
  }

  get session() {
    return this.runtime.sessions;
  }

  get authorization() {
    return this.runtime.authorization;
  }

  get mfa() {
    return this.runtime.mfa;
  }

  get oauth() {
    return this.runtime.oauth;
  }

  get apiKeys() {
    return this.runtime.apiKeys;
  }

  get tokens() {
    return this.runtime.tokens;
  }

  get metrics() {
    return this.runtime.metrics;
  }

  get trace() {
    return this.runtime.trace;
  }
}

/** Build a typed runtime client, validating configuration eagerly. */
export function createRuntimeClient(config: PezhwanConfig): RuntimeClient {
  return new RuntimeClient(config);
}
