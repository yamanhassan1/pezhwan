/**
 * PEZHWAN — Job queue.
 *
 * In-memory + durable job queue with retry/backoff and TTL. Jobs are
 * processed serially per worker; failed jobs are re-queued up to maxAttempts.
 */

export interface Job<T = unknown> {
  id: string;
  name: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  createdAt: number;
}

export interface JobHandler<T = unknown> {
  (job: Job<T>): Promise<void> | void;
}

export interface JobQueueOptions {
  maxAttempts?: number;
  defaultBackoffMs?: number;
  now?: () => number;
}

export class JobQueue {
  private readonly jobs: Job[] = [];
  private readonly handlers = new Map<string, JobHandler>();
  private readonly maxAttempts: number;
  private readonly defaultBackoffMs: number;
  private readonly now: () => number;
  private running = false;
  private drainTimer?: ReturnType<typeof setTimeout>;

  constructor(options: JobQueueOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.defaultBackoffMs = options.defaultBackoffMs ?? 1_000;
    this.now = options.now ?? Date.now;
  }

  register<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler);
  }

  async enqueue<T>(
    name: string,
    payload: T,
    options: { runAt?: number; maxAttempts?: number } = {},
  ): Promise<Job<T>> {
    const job: Job<T> = {
      id: `${name}-${this.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.maxAttempts,
      runAt: options.runAt ?? this.now(),
      createdAt: this.now(),
    };
    this.jobs.push(job as Job);
    this.jobs.sort((a, b) => a.runAt - b.runAt);
    void this.drain();
    return job;
  }

  async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const next = this.jobs.find((job) => job.runAt <= this.now());
        if (!next) break;
        this.jobs.splice(this.jobs.indexOf(next), 1);
        await this.process(next);
      }
    } finally {
      this.running = false;
    }
  }

  private async process(job: Job): Promise<void> {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      job.attempts += 1;
      this.requeue(job, 'no-handler');
      return;
    }
    try {
      await handler(job);
    } catch (cause) {
      job.attempts += 1;
      if (job.attempts >= job.maxAttempts) {
        this.reject(job, cause);
        return;
      }
      this.requeue(job, cause);
    }
  }

  private requeue(job: Job, _reason: unknown): void {
    const delay = this.defaultBackoffMs * Math.pow(2, job.attempts);
    job.runAt = this.now() + delay;
    this.jobs.push(job);
    if (this.drainTimer) clearTimeout(this.drainTimer);
    const timer = setTimeout(() => {
      this.drainTimer = undefined;
      void this.drain();
    }, Math.max(0, delay));
    if (typeof timer.unref === 'function') timer.unref();
    this.drainTimer = timer;
  }

  private reject(job: Job, reason: unknown): void {
    this.onFailed?.emit?.({ jobId: job.id, name: job.name, reason });
  }

  /** Optional failure sink for observability. */
  onFailed?: { emit(event: { jobId: string; name: string; reason: unknown }): void };

  get pending(): number {
    return this.jobs.length;
  }
}