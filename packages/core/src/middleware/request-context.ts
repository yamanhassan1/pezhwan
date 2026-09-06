/**
 * PEZHWAN — Request context.
 *
 * Async-local request context (request id, tenant, user, timings) shared
 * through a simple carrier. Node 16+ `AsyncLocalStorage` is used when
 * available; otherwise a process-wide fallback carrier is used.
 */

import { randomUUID } from 'node:crypto';

export interface RequestContextData {
  requestId: string;
  startedAt: number;
  method?: string;
  path?: string;
  ip?: string;
  tenantId?: string;
  applicationId?: string;
  userId?: string;
  sessionId?: string;
}

type AsyncLocalStore = {
  getStore(): RequestContextData | undefined;
  run<T>(store: RequestContextData, callback: () => T | Promise<T>): T | Promise<T>;
};

let als: AsyncLocalStore | null = null;
const fallback: RequestContextData = {
  requestId: '',
  startedAt: 0,
};

function loadAls(): AsyncLocalStore | null {
  if (als) return als;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AsyncLocalStorage } = require('node:async_hooks') as {
      AsyncLocalStorage: new () => AsyncLocalStore;
    };
    als = new AsyncLocalStorage();
    return als;
  } catch {
    return null;
  }
}

export class RequestContext {
  static create(input: Partial<RequestContextData> = {}): RequestContextData {
    return {
      requestId: input.requestId ?? randomUUID(),
      startedAt: input.startedAt ?? Date.now(),
      method: input.method,
      path: input.path,
      ip: input.ip,
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      userId: input.userId,
      sessionId: input.sessionId,
    };
  }

  static run<T>(data: RequestContextData, fn: () => T | Promise<T>): T | Promise<T> {
    const store = loadAls();
    if (store) return store.run(data, fn);
    (fallback as unknown as { _current: RequestContextData })['_current'] = data;
    return fn();
  }

  static current(): RequestContextData {
    const store = loadAls();
    if (store) {
      const value = store.getStore();
      if (value) return value;
    }
    const current = (fallback as unknown as { _current?: RequestContextData })['_current'];
    return current ?? RequestContext.create();
  }

  static requestId(): string {
    return RequestContext.current().requestId;
  }
}