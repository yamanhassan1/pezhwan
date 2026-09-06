/**
 * PEZHWAN — Audit retention service.
 *
 * Enforces a configurable per-domain retention policy over the audit store,
 * pruning entries older than the policy and refusing to log sensitive events
 * (passwords, tokens, OTPs) that would violate record-retention rules.
 */

import type { Severity } from '@pezhwan/shared';

export interface RetentionPolicy {
  domain: string;
  maxDays: number;
}

export interface RetentionResult {
  pruned: number;
  domains: string[];
}

export interface RetentionStore {
  deleteOlderThan(domain: string, cutoff: Date): Promise<number>;
}

export interface SensitiveAuditCheck {
  eventType: string | string[];
}

const SENSITIVE_MARKERS = ['password', 'secret', 'token', 'otp', 'authorization', 'credential'];

export class RetentionService {
  private readonly policies: Map<string, number>;

  constructor(policies?: RetentionPolicy[]) {
    this.policies = new Map((policies ?? []).map((p) => [p.domain, p.maxDays]));
  }

  policyFor(domain: string): number {
    return this.policies.get(domain) ?? 0;
  }

  setPolicy(domain: string, maxDays: number): void {
    if (maxDays < 0) throw new Error('maxDays must be >= 0');
    this.policies.set(domain, maxDays);
  }

  /** True when an event type should never be retained long-term. */
  isSensitive(eventType: string): boolean {
    const lower = eventType.toLowerCase();
    return SENSITIVE_MARKERS.some((marker) => lower.includes(marker));
  }

  async runRetention(store: RetentionStore, now = new Date()): Promise<RetentionResult> {
    let pruned = 0;
    const domains: string[] = [];
    for (const [domain, maxDays] of this.policies) {
      if (maxDays <= 0) continue;
      const cutoff = new Date(now.getTime() - maxDays * 86_400_000);
      const count = await store.deleteOlderThan(domain, cutoff);
      pruned += count;
      domains.push(domain);
    }
    return { pruned, domains };
  }
}