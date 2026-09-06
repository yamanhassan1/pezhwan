/**
 * PEZHWAN — Projector.
 *
 * Builds and updates read models by folding events in stream order.
 */

import type { StoredEvent } from './event-store.ts';

export interface ProjectionState {
  version: number;
  [key: string]: unknown;
}

export type ProjectionHandler = (
  state: ProjectionState,
  event: StoredEvent,
) => ProjectionState | void | Promise<ProjectionState | void>;

export class Projector {
  private readonly handlers = new Map<string, ProjectionHandler>();

  when(eventType: string, handler: ProjectionHandler): void {
    this.handlers.set(eventType, handler);
  }

  /** Folds a batch of events into the projection state. */
  async apply(state: ProjectionState, events: StoredEvent[]): Promise<ProjectionState> {
    let current = state;
    for (const event of events) {
      if (event.version <= current.version) continue;
      const handler = this.handlers.get(event.type);
      if (handler) {
        current = (await handler(current, event)) ?? current;
      }
      current = { ...current, version: event.version };
    }
    return current;
  }
}