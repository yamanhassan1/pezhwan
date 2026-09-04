/**
 * PEZHWAN — MongoDB connection pool manager.
 *
 * Manages a shared Mongoose connection with health checks, retry logic,
 * and graceful shutdown. Exposes a simple interface for the core engine
 * to verify database connectivity before serving requests.
 */

import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionPoolOptions {
  /** MongoDB connection URI. */
  uri: string;
  /** Mongoose connection options. */
  mongooseOptions?: mongoose.ConnectOptions;
  /** Timeout for the initial connection in ms (default 10 000). */
  connectTimeoutMs?: number;
  /** Number of connection retries before failing (default 3). */
  maxRetries?: number;
  /** Delay between retries in ms (default 1 000). */
  retryDelayMs?: number;
}

export interface ConnectionHealth {
  status: 'connected' | 'disconnected' | 'error';
  readyState: number;
  host?: string;
  port?: number;
  database?: string;
  uptimeMs?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Connection Pool
// ---------------------------------------------------------------------------

export class ConnectionPool {
  private connected = false;
  private connectedAt: number | null = null;
  private lastError: string | null = null;
  private readonly options: Required<Omit<ConnectionPoolOptions, 'mongooseOptions'>> & {
    mongooseOptions?: mongoose.ConnectOptions;
  };

  constructor(options: ConnectionPoolOptions) {
    this.options = {
      uri: options.uri,
      mongooseOptions: options.mongooseOptions,
      connectTimeoutMs: options.connectTimeoutMs ?? 10_000,
      maxRetries: options.maxRetries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 1_000,
    };
  }

  /**
   * Establish the Mongoose connection with retry logic.
   * Safe to call multiple times — idempotent.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    const { uri, mongooseOptions, connectTimeoutMs, maxRetries, retryDelayMs } = this.options;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        await mongoose.connect(uri, {
          ...mongooseOptions,
          serverSelectionTimeoutMS: connectTimeoutMs,
          heartbeatFrequencyMS: 10_000,
        });
        this.connected = true;
        this.connectedAt = Date.now();
        this.lastError = null;
        return;
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
        }
      }
    }

    throw new Error(
      `ConnectionPool: failed to connect after ${maxRetries} attempts. Last error: ${this.lastError}`,
    );
  }

  /**
   * Gracefully close the connection.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    try {
      await mongoose.disconnect();
    } finally {
      this.connected = false;
      this.connectedAt = null;
    }
  }

  /**
   * Non-throwing health check. Returns the current connection state.
   */
  async health(): Promise<ConnectionHealth> {
    const readyState = mongoose.connection.readyState;
    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    if (readyState === 1) {
      const host = mongoose.connection.host;
      const port = mongoose.connection.port;
      const database = mongoose.connection.name;
      return {
        status: 'connected',
        readyState,
        host: host ?? undefined,
        port: port ?? undefined,
        database: database ?? undefined,
        uptimeMs: this.connectedAt ? Date.now() - this.connectedAt : undefined,
      };
    }
    if (readyState === 2) {
      return { status: 'disconnected', readyState };
    }
    return {
      status: this.lastError ? 'error' : 'disconnected',
      readyState,
      error: this.lastError ?? undefined,
    };
  }

  /**
   * Ping the database to verify it's reachable. Returns true on success.
   */
  async ping(): Promise<boolean> {
    try {
      if (mongoose.connection.readyState !== 1) {
        return false;
      }
      await mongoose.connection.db?.admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  get isConnected(): boolean {
    return this.connected && mongoose.connection.readyState === 1;
  }
}

export function createConnectionPool(options: ConnectionPoolOptions): ConnectionPool {
  return new ConnectionPool(options);
}
