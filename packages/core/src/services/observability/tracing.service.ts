/**
 * PEZHWAN — Tracing service.
 *
 * Lightweight, dependency-free distributed tracing: a shared trace context
 * (traceId + spanId) per async flow, with optional span recording.
 */

import { randomUUID } from 'node:crypto';

export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string>;
}

export interface TraceRecorder {
  record(span: TraceSpan): void;
}

export class NoopTraceRecorder implements TraceRecorder {
  record(_span: TraceSpan): void {
    /* no-op */
  }
}

export class TracingService {
  private readonly recorder: TraceRecorder;

  constructor(recorder?: TraceRecorder) {
    this.recorder = recorder ?? new NoopTraceRecorder();
  }

  root(name = 'request', attributes: Record<string, string> = {}): TraceSpan {
    const now = Date.now();
    const span: TraceSpan = {
      traceId: randomUUID().replace(/-/g, '').slice(0, 16),
      spanId: randomUUID().replace(/-/g, '').slice(0, 16),
      name,
      startTime: now,
      attributes,
    };
    return span;
  }

  child(parent: TraceSpan, name: string, attributes: Record<string, string> = {}): TraceSpan {
    return {
      traceId: parent.traceId,
      spanId: randomUUID().replace(/-/g, '').slice(0, 16),
      parentSpanId: parent.spanId,
      name,
      startTime: Date.now(),
      attributes,
    };
  }

  finish(span: TraceSpan): TraceSpan {
    span.endTime = Date.now();
    this.recorder.record(span);
    return span;
  }

  async trace<T>(name: string, fn: () => Promise<T>, attributes: Record<string, string> = {}): Promise<T> {
    const span = this.root(name, attributes);
    try {
      return await fn();
    } finally {
      this.finish(span);
    }
  }
}