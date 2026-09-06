/**
 * PEZHWAN — Event store.
 *
 * Append-only durable event log. Projects hydrate their state by replaying
 * these events; snapshots cap replay cost. The store is model-agnostic hooks
 * so any DB (mongoose, postgres) can back it.
 */

export interface StoredEvent {
  streamId: string;
  version: number;
  type: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  occurredAt: number;
}

export interface EventStoreBackend {
  append(events: StoredEvent[], expectedVersion?: number): Promise<void>;
  read(streamId: string, afterVersion?: number): Promise<StoredEvent[]>;
  readAll(limit?: number, offset?: number): Promise<StoredEvent[]>;
}

export class EventStore {
  constructor(private readonly backend: EventStoreBackend) {}

  /** Appends events to a stream, enforcing optimistic concurrency. */
  async append(
    streamId: string,
    events: Array<Omit<StoredEvent, 'streamId'>>,
    expectedVersion?: number,
  ): Promise<void> {
    const base = (expectedVersion ?? (await this.backend.read(streamId)).length) ?? 0;
    const next = events.map((event, index) => ({
      ...event,
      streamId,
      version: base + index + 1,
    }));
    await this.backend.append(next, expectedVersion);
  }

  read(streamId: string, afterVersion?: number): Promise<StoredEvent[]> {
    return this.backend.read(streamId, afterVersion);
  }

  readAll(limit?: number, offset?: number): Promise<StoredEvent[]> {
    return this.backend.readAll(limit, offset);
  }
}