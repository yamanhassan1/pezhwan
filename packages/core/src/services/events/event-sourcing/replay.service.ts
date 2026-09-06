/**
 * PEZHWAN — Replay service.
 *
 * Hydrates projections from the event store, skipping events already folded
 * based on the projection's version watermark.
 */

import type { EventStore } from './event-store.ts';
import type { Projector, ProjectionState } from './projector.ts';

export class ReplayService {
  constructor(
    private readonly store: EventStore,
    private readonly projector: Projector,
  ) {}

  /** Replays a stream into the given projection state. */
  replay(streamId: string, state: ProjectionState): Promise<ProjectionState> {
    return this.store.read(streamId, state.version).then((events) => this.projector.apply(state, events));
  }

  /** Re-evaluates projections for a single stream from scratch. */
  replayFromZero(streamId: string): Promise<ProjectionState> {
    return this.replay(streamId, { version: 0 });
  }
}