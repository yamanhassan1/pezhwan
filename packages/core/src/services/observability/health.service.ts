/**
 * PEZHWAN — Health service.
 *
 * Aggregates liveness and readiness probes from configured dependencies into a
 * single health report. Never throws; failures are reported as non-ok statuses.
 */

export interface Probe {
  name: string;
  check(): Promise<boolean> | boolean;
}

export interface RuntimeHealthStatus {
  ok: boolean;
  services: Record<string, 'ok' | 'degraded' | 'down'>;
  uptimeSeconds: number;
}

export class HealthService {
  private readonly probes = new Map<string, Probe>();
  private readonly startedAt = Date.now();

  constructor(probes: Probe[] = []) {
    for (const probe of probes) this.probes.set(probe.name, probe);
  }

  register(probe: Probe): void {
    this.probes.set(probe.name, probe);
  }

  /** Liveness: the process is up. */
  liveness(): RuntimeHealthStatus {
    return {
      ok: true,
      services: { process: 'ok' },
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  /** Readiness: all registered probes respond. */
  async readiness(): Promise<RuntimeHealthStatus> {
    const services: Record<string, 'ok' | 'degraded' | 'down'> = {};
    let ok = true;
    for (const [name, probe] of this.probes) {
      try {
        const healthy = await probe.check();
        services[name] = healthy ? 'ok' : 'degraded';
        if (!healthy) ok = false;
      } catch {
        services[name] = 'down';
        ok = false;
      }
    }
    return { ok, services, uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000) };
  }
}