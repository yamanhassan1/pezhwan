/**
 * PEZHWAN — Event bus.
 *
 * In-process publish/subscribe with typed listeners. Optional persistence hook
 * lets durable stores replay events (see event-sourcing store).
 */

export interface EventEnvelope<T = unknown> {
  type: string;
  payload: T;
  id: string;
  createdAt: number;
  tenantId?: string;
}

export type EventListener<T = unknown> = (event: EventEnvelope<T>) => void | Promise<void>;

const BARE = 0;
let counter = 0;

export class EventBus {
  private readonly listeners = new Map<string, Set<EventListener>>();
  private readonly wildcard = new Set<EventListener>();
  private readonly persistence?: (event: EventEnvelope) => Promise<void>;

  constructor(persistence?: (event: EventEnvelope) => Promise<void>) {
    this.persistence = persistence;
  }

  subscribe<T>(type: string, listener: EventListener<T>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    const entry = listener as EventListener;
    set.add(entry);
    return () => {
      set.delete(entry);
      if (set.size === 0) this.listeners.delete(type);
    };
  }

  subscribeAll(listener: EventListener): () => void {
    this.wildcard.add(listener);
    return () => this.wildcard.delete(listener);
  }

  async publish<T>(type: string, payload: T, tenantId?: string): Promise<EventEnvelope<T>> {
    const event: EventEnvelope<T> = {
      type,
      payload,
      id: `${BARE}-${++counter}-${Date.now().toString(36)}`,
      createdAt: Date.now(),
      tenantId,
    };
    if (this.persistence) {
      await this.persistence(event as EventEnvelope);
    }
    const handlers = [...(this.listeners.get(type) ?? []), ...this.wildcard];
    for (const handler of handlers) {
      await Promise.resolve(handler(event));
    }
    return event;
  }
}