/**
 * PEZHWAN — Session / async infrastructure integration test.
 *
 * Exercises the real event bus, job queue with retry/backoff, and webhook
 * signature helpers together (no persistence required).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  EventBus,
  JobQueue,
  NoopTraceRecorder,
  TracingService,
  WebhookService,
} from '@pezhwan/core';

test('event bus fans out to typed listeners and honors unsubscribe', async () => {
  const bus = new EventBus();
  const seen: string[] = [];
  const off = bus.subscribe('auth.login', (event) => {
    seen.push(String(event.payload));
  });
  const offAll = bus.subscribeAll((event) => {
    seen.push(`all:${event.type}`);
  });

  await bus.publish('auth.login', 'ok');
  assert.deepEqual(seen, ['ok', 'all:auth.login']);

  off();
  await bus.publish('auth.login', 'second');
  assert.equal(seen.filter((entry) => entry === 'second').length, 0);

  offAll();
  await bus.publish('other.event', 1);
  assert.equal(seen.filter((entry) => entry === 'all:other.event').length, 0);
});

test('event bus persists every event through the persistence hook', async () => {
  const stored: string[] = [];
  const bus = new EventBus(async (event) => {
    stored.push(event.id);
  });
  await bus.publish('domain.order_placed', { id: 1 });
  await bus.publish('domain.order_placed', { id: 2 });
  assert.equal(stored.length, 2);
});

async function settle(queue: JobQueue): Promise<void> {
  for (let i = 0; i < 500 && queue.pending > 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('job queue drains jobs and retries with backoff before succeeding', async () => {
  const queue = new JobQueue({ maxAttempts: 5, defaultBackoffMs: 5 });
  const attempts: number[] = [];

  let calls = 0;
  queue.register('flaky', async () => {
    calls += 1;
    attempts.push(calls);
    if (calls < 3) throw new Error('transient');
  });
  await queue.enqueue('flaky', {});
  await settle(queue);
  assert.deepEqual(attempts, [1, 2, 3]);
});

test('job queue exhausts retries for a permanently failing handler', async () => {
  const queue = new JobQueue({ maxAttempts: 3, defaultBackoffMs: 5 });
  const failures: Array<{ name: string }> = [];
  queue.onFailed = { emit: (event) => failures.push(event) };

  let calls = 0;
  queue.register('doomed', async () => {
    calls += 1;
    throw new Error('always fails');
  });
  await queue.enqueue('doomed', {});
  await settle(queue);

  assert.equal(calls, 3);
  assert.equal(failures.length, 1);
  assert.equal(failures[0]?.name, 'doomed');
});

test('webhook signatures are deterministic HMACs with a random secret', () => {
  const payload = '{"event":"auth.login","payload":{}}';
  const secretA = WebhookService.randomSecret();
  const secretB = WebhookService.randomSecret();
  assert.notEqual(secretA, secretB);
  assert.ok(secretA.length >= 32);

  const signature = WebhookService.sign(secretA, payload);
  assert.match(signature, /^[0-9a-f]{64}$/);
  assert.equal(WebhookService.sign(secretA, payload), signature);
  assert.notEqual(WebhookService.sign(secretA, payload + ' '), signature);
  assert.notEqual(WebhookService.sign(secretB, payload), signature);
});

test('tracing service builds parent/child spans that share a trace id', () => {
  const recorder = new NoopTraceRecorder();
  const tracing = new TracingService(recorder);

  const root = tracing.root('request');
  const child = tracing.child(root, 'db.query');

  assert.equal(root.traceId, child.traceId);
  assert.equal(child.parentSpanId, root.spanId);
  assert.notEqual(root.spanId, child.spanId);

  const finished = tracing.finish(root);
  assert.ok(finished.endTime !== undefined);
});