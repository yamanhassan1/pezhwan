/**
 * PEZHWAN — query performance optimiser.
 *
 * Monitors slow queries and provides index recommendations. Uses MongoDB
 * `explain()` output analysis to suggest missing indexes for the most
 * frequently executed queries. This is a development/operations tool, not
 * a runtime dependency.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlowQueryEntry {
  namespace: string;
  operation: string;
  filter: Record<string, unknown>;
  durationMs: number;
  docsExamined: number;
  docsReturned: number;
  indexesUsed: string[];
  timestamp: Date;
  suggestion?: IndexSuggestion;
}

export interface IndexSuggestion {
  collection: string;
  key: Record<string, 1 | -1>;
  reason: string;
  estimatedImpact: 'high' | 'medium' | 'low';
}

export interface QueryStats {
  totalQueries: number;
  slowQueries: number;
  avgDurationMs: number;
  p95DurationMs: number;
  topSlowCollections: Array<{ collection: string; count: number; avgMs: number }>;
}

export interface QueryOptimizerOptions {
  /** Threshold in ms above which a query is considered "slow" (default 100). */
  slowQueryThresholdMs?: number;
  /** Maximum number of slow queries to retain in memory (default 1000). */
  maxRetriedEntries?: number;
  /** Enable automatic index suggestion generation (default true). */
  enableSuggestions?: boolean;
}

// ---------------------------------------------------------------------------
// Optimiser
// ---------------------------------------------------------------------------

export class QueryOptimizer {
  private readonly slowQueries: SlowQueryEntry[] = [];
  private readonly thresholdMs: number;
  private readonly maxEntries: number;
  private readonly enableSuggestions: boolean;

  constructor(options: QueryOptimizerOptions = {}) {
    this.thresholdMs = options.slowQueryThresholdMs ?? 100;
    this.maxEntries = options.maxRetriedEntries ?? 1000;
    this.enableSuggestions = options.enableSuggestions ?? true;
  }

  /**
   * Record a query execution for analysis. If the query exceeded the
   * threshold, it is added to the slow-query log and (optionally) an
   * index suggestion is generated.
   */
  record(entry: Omit<SlowQueryEntry, 'timestamp' | 'suggestion'>): void {
    if (entry.durationMs < this.thresholdMs) {
      return;
    }

    const slowEntry: SlowQueryEntry = {
      ...entry,
      timestamp: new Date(),
      suggestion: this.enableSuggestions ? this.generateSuggestion(entry) : undefined,
    };

    this.slowQueries.push(slowEntry);

    // Evict oldest when at capacity.
    if (this.slowQueries.length > this.maxEntries) {
      this.slowQueries.splice(0, this.slowQueries.length - this.maxEntries);
    }
  }

  /**
   * Analyse a MongoDB explain() output and return optimisation suggestions.
   */
  analyseExplain(explainOutput: Record<string, unknown>): IndexSuggestion[] {
    const suggestions: IndexSuggestion[] = [];
    const planning = explainOutput['queryPlanner'] as Record<string, unknown> | undefined;
    const execution = explainOutput['executionStats'] as Record<string, unknown> | undefined;

    if (!planning || !execution) {
      return suggestions;
    }

    const namespace = (planning['namespace'] as string) ?? '';
    const collection = namespace.includes('.') ? (namespace.split('.')[1] ?? '') : namespace;
    const indexFilterSet = planning['indexFilterSet'] as boolean | undefined;
    const winningPlan = planning['winningPlan'] as Record<string, unknown> | undefined;
    const docsExamined = (execution['totalDocsExamined'] as number) ?? 0;
    const docsReturned = (execution['totalDocsReturned'] as number) ?? 0;

    // Collection scan (no index used) is always worth flagging.
    if (winningPlan && winningPlan['stage'] === 'COLLSCAN') {
      suggestions.push({
        collection,
        key: { _id: 1 },
        reason: 'No index used (collection scan). Add a targeted index for the query filter.',
        estimatedImpact: 'high',
      });
    }

    // High doc-examined to doc-returned ratio suggests a missing or
    // non-selective index.
    if (docsReturned > 0 && docsExamined / docsReturned > 10) {
      suggestions.push({
        collection,
        key: { _id: 1 },
        reason: `High doc-examined ratio (${docsExamined}:${docsReturned}). Consider a more selective index.`,
        estimatedImpact: 'medium',
      });
    }

    // No index filter set — the query planner did not use index bounds.
    if (indexFilterSet === false) {
      suggestions.push({
        collection,
        key: { _id: 1 },
        reason: 'No index filters applied. Ensure indexes cover the query predicates.',
        estimatedImpact: 'medium',
      });
    }

    return suggestions;
  }

  /**
   * Generate aggregate statistics from recorded slow queries.
   */
  stats(): QueryStats {
    const entries = this.slowQueries;
    const total = entries.length;
    if (total === 0) {
      return {
        totalQueries: 0,
        slowQueries: 0,
        avgDurationMs: 0,
        p95DurationMs: 0,
        topSlowCollections: [],
      };
    }

    const durations = entries.map((e) => e.durationMs).sort((a, b) => a - b);
    const avg = durations.reduce((s, d) => s + d, 0) / total;
    const p95Index = Math.floor(total * 0.95);
    const p95 = durations[p95Index] ?? durations[total - 1]!;

    // Group by collection.
    const byCollection = new Map<string, { count: number; totalMs: number }>();
    for (const e of entries) {
      const coll = e.namespace;
      const existing = byCollection.get(coll);
      if (existing) {
        existing.count += 1;
        existing.totalMs += e.durationMs;
      } else {
        byCollection.set(coll, { count: 1, totalMs: e.durationMs });
      }
    }

    const topSlowCollections = Array.from(byCollection.entries())
      .map(([collection, { count, totalMs }]) => ({
        collection,
        count,
        avgMs: Math.round(totalMs / count),
      }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, 10);

    return {
      totalQueries: total,
      slowQueries: total,
      avgDurationMs: Math.round(avg),
      p95DurationMs: p95,
      topSlowCollections,
    };
  }

  /**
   * Return all recorded slow queries, optionally filtered by collection.
   */
  getSlowQueries(collection?: string): SlowQueryEntry[] {
    if (!collection) {
      return [...this.slowQueries];
    }
    return this.slowQueries.filter((e) => e.namespace === collection);
  }

  /** Clear all recorded data. */
  clear(): void {
    this.slowQueries.length = 0;
  }

  private generateSuggestion(
    entry: Omit<SlowQueryEntry, 'timestamp' | 'suggestion'>,
  ): IndexSuggestion | undefined {
    // Basic heuristic: if docs examined >> docs returned, suggest an index
    // on the most-likely filter fields.
    if (entry.docsReturned > 0 && entry.docsExamined / entry.docsReturned > 5) {
      const filterKeys = Object.keys(entry.filter).filter((k) => k !== '_id');
      if (filterKeys.length > 0) {
        const key: Record<string, 1> = {};
        for (const k of filterKeys) {
          key[k] = 1;
        }
        return {
          collection: entry.namespace,
          key,
          reason: `High doc-examined ratio. Consider an index on: ${filterKeys.join(', ')}`,
          estimatedImpact: entry.docsExamined / entry.docsReturned > 20 ? 'high' : 'medium',
        };
      }
    }
    return undefined;
  }
}

export function createQueryOptimizer(options?: QueryOptimizerOptions): QueryOptimizer {
  return new QueryOptimizer(options);
}
