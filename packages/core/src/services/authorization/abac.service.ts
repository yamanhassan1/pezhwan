/**
 * PEZHWAN — ABAC service (attribute-based access control).
 *
 * Evaluates resource/action/attribute conditions against a context so that
 * fine-grained decisions (e.g. "owner may edit ONLY within their tenant") can
 * be expressed declaratively.
 */

import { ExpressionPolicyEngine } from './policy-engine.ts';
import type { Policy } from './policy-engine.ts';

export interface AbacContext {
  userId: string;
  tenantId: string;
  applicationId: string;
  resource?: string;
  action?: string;
  resourceId?: string;
  attributes?: Record<string, unknown>;
}

export class AbacService {
  private readonly engine: ExpressionPolicyEngine;

  constructor(policies: Policy[] = []) {
    this.engine = new ExpressionPolicyEngine(policies);
  }

  /** Fully-qualified decision context fed to the policy engine. */
  private contextFrom(input: AbacContext): Record<string, unknown> {
    return {
      user: { id: input.userId, tenantId: input.tenantId },
      tenant: { id: input.tenantId },
      application: { id: input.applicationId },
      request: {
        resourceId: input.resourceId,
        resource: input.resource,
        action: input.action,
        attributes: input.attributes ?? {},
      },
    };
  }

  /** Evaluates the subject's ABAC policy for a resource:action pair. */
  async can(input: AbacContext): Promise<boolean> {
    const decision = this.engine.evaluate(this.contextFrom(input));
    return decision.allowed;
  }

  /** Registers additional policies at runtime. */
  add(policy: Policy): void {
    this.engine.add(policy);
  }
}