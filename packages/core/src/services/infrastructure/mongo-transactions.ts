/**
 * PEZHWAN — MongoDB transaction utilities.
 *
 * Provides a reusable transaction wrapper with automatic retry logic for
 * transient errors (write conflicts, deadlocks, snapshot-too-old). Falls back
 * gracefully to no-session mode on standalone MongoDB instances that don't
 * support multi-document transactions.
 *
 * @module
 */

import mongoose, { type ClientSession } from 'mongoose';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransactionOptions {
  /** Maximum retry attempts on transient errors (default: 3). */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff (default: 25). */
  baseDelayMs?: number;
  /** Predicate to mark an error as non-retryable (e.g. domain errors). */
  isNonRetryable?: (err: unknown) => boolean;
  /** Called when a retry occurs. */
  onRetry?: (attempt: number, error: unknown) => void;
  /** Called when falling back to no-session mode. */
  onFallback?: (reason: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * MongoDB error codes that indicate a transient transaction failure.
 *
 * 112  WriteConflict
 * 245  Deadlock
 * 262  SnapshotTooOld
 * 249  ReadConflict
 * 251  NoSuchTransaction
 * 24   LockTimeout
 * 103  ExceededTimeLimit
 * 116  SocketException
 * 133  NetworkTimeout
 * 13   HostUnreachable
 */
const TRANSIENT_ERROR_CODES = new Set([112, 245, 262, 249, 251, 24, 103, 116, 133, 13]);

const TRANSIENT_ERROR_REGEX = /session|topology|close|network|socket/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Detect whether the current MongoDB topology supports multi-document
 * transactions (i.e. is a replica set or sharded cluster).
 */
export function transactionsSupported(conn?: mongoose.Connection): boolean {
  const connection = conn ?? mongoose.connection;
  const topology = connection.readyState === 1 ? (connection as any).topology : null;

  if (!topology) return false;

  const description = topology.description;
  if (!description) return false;

  // Replica set or sharded cluster support transactions.
  return description.setName != null || description.type === 'Sharded';
}

/**
 * Classify whether an error is a transient transaction failure that is
 * safe to retry.
 */
export function isTransientTransactionError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: number }).code;
    if (code !== undefined && TRANSIENT_ERROR_CODES.has(code)) {
      return true;
    }
  }
  if (err instanceof Error && TRANSIENT_ERROR_REGEX.test(err.message)) {
    return true;
  }
  return false;
}

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main transaction wrapper
// ---------------------------------------------------------------------------

/**
 * Execute work inside a MongoDB transaction with automatic retry on transient
 * errors. Falls back to a no-session run when the topology doesn't support
 * transactions (standalone dev/test instances).
 *
 * @example
 * ```ts
 * const result = await withTransaction(async (session) => {
 *   await OrderModel.create([{ ... }], { session });
 *   await InventoryModel.updateOne({ ... }, { $inc: { qty: -1 } }, { session });
 *   return order;
 * });
 * ```
 */
export async function withTransaction<T>(
  work: (session: ClientSession | null) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 25, isNonRetryable, onRetry, onFallback } = options;

  const conn = mongoose.connection;

  if (!transactionsSupported(conn)) {
    onFallback?.('topology does not support transactions');
    return work(null);
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let session: ClientSession | null = null;
    try {
      session = await conn.startSession();
      let out: T | undefined;
      await session.withTransaction(async (txSession) => {
        out = await work(txSession);
        return txSession;
      });
      return out as T;
    } catch (err) {
      if (isNonRetryable?.(err)) {
        throw err;
      }
      if (attempt >= maxAttempts || !isTransientTransactionError(err)) {
        if (attempt >= maxAttempts && !isTransientTransactionError(err)) {
          onFallback?.('non-transient error after max attempts');
          return work(null);
        }
        throw err;
      }
      onRetry?.(attempt, err);
    } finally {
      session?.endSession().catch(() => {
        /* best effort */
      });
    }
    await sleep(baseDelayMs * 2 ** (attempt - 1));
  }

  onFallback?.('exhausted retries');
  return work(null);
}

/**
 * Execute multiple operations atomically across collections.
 *
 * A convenience wrapper that bundles common create+update patterns.
 *
 * @example
 * ```ts
 * await transactionalWrite([
 *   { model: OrderModel, operation: 'create', data: orderDoc },
 *   { model: InventoryModel, operation: 'updateOne', filter: { sku: 'A' }, update: { $inc: { qty: -1 } } },
 * ]);
 * ```
 */
export interface TransactionalOperation {
  model: mongoose.Model<any>;
  operation:
    | 'create'
    | 'insertMany'
    | 'updateOne'
    | 'updateMany'
    | 'deleteOne'
    | 'deleteMany'
    | 'findOneAndUpdate'
    | 'replaceOne';
  data?: any;
  filter?: any;
  update?: any;
  options?: any;
}

export async function transactionalWrite(
  operations: TransactionalOperation[],
  options: TransactionOptions = {},
): Promise<void> {
  await withTransaction(async (session) => {
    for (const op of operations) {
      const sessionOpts = session ? { session } : {};
      switch (op.operation) {
        case 'create':
          await op.model.create([op.data], sessionOpts);
          break;
        case 'insertMany':
          await op.model.insertMany(op.data, sessionOpts);
          break;
        case 'updateOne':
          await op.model.updateOne(op.filter, op.update, { ...op.options, ...sessionOpts });
          break;
        case 'updateMany':
          await op.model.updateMany(op.filter, op.update, { ...op.options, ...sessionOpts });
          break;
        case 'deleteOne':
          await op.model.deleteOne(op.filter, sessionOpts);
          break;
        case 'deleteMany':
          await op.model.deleteMany(op.filter, sessionOpts);
          break;
        case 'findOneAndUpdate':
          await op.model.findOneAndUpdate(op.filter, op.update, { ...op.options, ...sessionOpts });
          break;
        case 'replaceOne':
          await op.model.replaceOne(op.filter, op.data, { ...op.options, ...sessionOpts });
          break;
      }
    }
  }, options);
}

/**
 * Check transaction health (for health endpoints).
 *
 * Returns whether the current MongoDB connection supports transactions
 * and is in a healthy state.
 */
export async function checkTransactionHealth(): Promise<{
  supported: boolean;
  healthy: boolean;
  topology?: string;
  detail?: string;
}> {
  try {
    const conn = mongoose.connection;
    if (conn.readyState !== 1) {
      return { supported: false, healthy: false, detail: 'not connected' };
    }

    const supported = transactionsSupported(conn);
    const topology = (conn as any).topology?.description?.type ?? 'unknown';

    // Try a dummy transaction to verify replica set health
    if (supported) {
      const session = await conn.startSession();
      try {
        await session.withTransaction(async () => {
          await conn.db!.admin().command({ ping: 1 });
        });
        return { supported: true, healthy: true, topology };
      } finally {
        await session.endSession();
      }
    }

    return { supported: false, healthy: true, topology, detail: 'standalone mode' };
  } catch (err) {
    return {
      supported: false,
      healthy: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
