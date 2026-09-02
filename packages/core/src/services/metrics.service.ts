/**
 * PEZHWAN — metrics registry.
 *
 * Lightweight in-process counters (no external dependency). Suitable for
 * scraping or exporting via OpenTelemetry hooks. Provides auth, authorization,
 * rate-limit, and security-event metric buckets.
 */

export type MetricName =
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.register.total'
  | 'auth.refresh.success'
  | 'auth.refresh.reuse'
  | 'auth.otp.sent'
  | 'auth.otp.failed'
  | 'auth.mfa.success'
  | 'auth.mfa.failed'
  | 'auth.oauth.authorized'
  | 'auth.oauth.exchanged'
  | 'auth.api_key.total'
  | 'authz.denied'
  | 'ratelimit.hit'
  | 'security.event'
  | 'token.revoked';

export interface MetricCounter {
  name: MetricName;
  value: number;
}

/** OpenTelemetry-compatible hook consumers can implement. */
export interface MetricsExporter {
  (counters: MetricCounter[]): Promise<void> | void;
}

export class MetricsRegistry {
  private readonly counters = new Map<MetricName, number>();
  private readonly startedAt = Date.now();
  private exporter?: MetricsExporter;

  setExporter(exporter: MetricsExporter): void {
    this.exporter = exporter;
  }

  increment(name: MetricName, by = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + by);
  }

  snapshot(): MetricCounter[] {
    return [...this.counters.entries()].map(([name, value]) => ({ name, value }));
  }

  /** Flush counters through the exporter (if any), then reset them. */
  async flush(): Promise<void> {
    const snapshot = this.snapshot();
    if (this.exporter && snapshot.length > 0) {
      try {
        await this.exporter(snapshot);
      } catch {
        // Metrics export must never break auth.
      }
    }
    this.counters.clear();
  }

  /** Seconds since first registration (uptime for dashboards). */
  uptimeSeconds(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  get(name: MetricName): number {
    return this.counters.get(name) ?? 0;
  }
}