/**
 * PEZHWAN — Audit writer.
 *
 * A thin, DB-agnostic sink that persists immutable audit entries through the
 * canonical AuditService while keeping the writer decoupled from callers.
 */

import type { AuditService, AuditEntryInput } from '../audit.service.ts';

export interface AuditWriterOptions {
  audit: Pick<AuditService, 'log'>;
  fallbackSink?: (entry: AuditEntryInput) => Promise<void>;
}

export class AuditWriter {
  private readonly audit: AuditWriterOptions['audit'];
  private readonly fallbackSink?: AuditWriterOptions['fallbackSink'];

  constructor(options: AuditWriterOptions) {
    this.audit = options.audit;
    this.fallbackSink = options.fallbackSink;
  }

  async write(entry: AuditEntryInput): Promise<void> {
    try {
      await this.audit.log(entry);
    } catch (cause) {
      if (!this.fallbackSink) throw cause;
      await this.fallbackSink(entry);
    }
  }

  async writeMany(entries: AuditEntryInput[]): Promise<void> {
    for (const entry of entries) await this.write(entry);
  }
}