/**
 * PEZHWAN — Policy engine.
 *
 * A composable, expression-based policy evaluator for authorization decisions.
 * Policies are JSON-safe and evaluated against a context without code in the
 * policy itself (no evaluation of user-supplied functions).
 */

export type PolicyOperator =
  | 'eq'
  | 'ne'
  | 'in'
  | 'not_in'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'exists'
  | 'match';

export interface PolicyRule {
  /** Dot-notation path into the decision context (e.g. "user.roles"). */
  path: string;
  op: PolicyOperator;
  value?: unknown;
  args: unknown[];
}

export interface Policy {
  id?: string;
  effect: 'allow' | 'deny';
  rules: PolicyRule[];
}

export interface PolicyDecision {
  policyId?: string;
  allowed: boolean;
  reasons: string[];
}

const OPERATORS: Record<PolicyOperator, (actual: unknown, expected: unknown) => boolean> = {
  eq: (a, e) => a === e,
  ne: (a, e) => a !== e,
  in: (a, e) => Array.isArray(e) && e.some((item) => item === a),
  not_in: (a, e) => Array.isArray(e) && !e.some((item) => item === a),
  gt: (a, e) => (typeof a === 'number' ? a > Number(e) : false),
  gte: (a, e) => (typeof a === 'number' ? a >= Number(e) : false),
  lt: (a, e) => (typeof a === 'number' ? a < Number(e) : false),
  lte: (a, e) => (typeof a === 'number' ? a <= Number(e) : false),
  exists: (a) => a !== undefined && a !== null,
  match: (a, e) => (typeof a === 'string' && typeof e === 'string' ? a.includes(e) : false),
};

function resolvePath(context: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, context);
}

export class ExpressionPolicyEngine {
  private readonly policies: Policy[];

  constructor(policies: Policy[] = []) {
    this.policies = policies;
  }

  add(policy: Policy): void {
    this.policies.push(policy);
  }

  evaluate(context: Record<string, unknown>): PolicyDecision {
    const reasons: string[] = [];
    for (const policy of this.policies) {
      const matched = policy.rules.every((rule) => {
        const actual = resolvePath(context, rule.path);
        const operator = OPERATORS[rule.op];
        return operator ? operator(actual, rule.value) : false;
      });
      if (!matched) continue;
      reasons.push(`${policy.effect}:${policy.id ?? 'anonymous'}`);
      if (policy.effect === 'deny') {
        return { policyId: policy.id, allowed: false, reasons };
      }
      return { policyId: policy.id, allowed: true, reasons };
    }
    return { allowed: false, reasons };
  }

  evaluateAsync(context: Record<string, unknown>): Promise<PolicyDecision> {
    return Promise.resolve(this.evaluate(context));
  }
}