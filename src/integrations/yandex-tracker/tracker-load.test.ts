import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { TrackerDispatcher } from './tracker-dispatcher';
import { TrackerTransport, retryDelay, safeToRetry } from './tracker.transport';
import { TrackerLoadError, TrackerHttpError, trackerLoadMessage, withTrackerDeadline } from './tracker-load';
import { newRequestMetrics, requestMetrics } from '../../core/analytics/request-metrics';

const settings = { concurrency: 4, minIntervalMs: 0, maxQueue: 500, queueTimeoutMs: 3000, requestTimeoutMs: 1000 };

test('synthetic 50-request burst stays within concurrency and preserves request-local metrics', async () => {
  const dispatcher = new TrackerDispatcher(settings);
  let active = 0; let peak = 0;
  const fetcher = (async () => {
    active++; peak = Math.max(peak, active);
    await sleep(2); active--; return new Response('{"ok":true}');
  }) as typeof fetch;
  const transport = new TrackerTransport(dispatcher, { operationTimeoutMs: 3000, maxRetries: 0 }, fetcher);
  const all = Array.from({ length: 50 }, () => newRequestMetrics());
  await Promise.all(all.map((metrics) => requestMetrics.run(metrics, () => transport.json('https://tracker.test/v3/issues/TEST-1'))));
  assert.equal(peak, 4);
  assert.equal(all.reduce((sum, m) => sum + m.trackerRequests, 0), 50);
  assert.ok(all.every((m) => m.trackerRequests === 1));
  assert.ok(all.some((m) => m.queueWaitMs > 0));
});

test('synthetic 400-request burst rejects overflow instead of growing an unbounded queue', async () => {
  const dispatcher = new TrackerDispatcher({ ...settings, maxQueue: 200 });
  const jobs = Array.from({ length: 400 }, () => dispatcher.run(async () => { await sleep(1); return 1; }));
  const result = await Promise.allSettled(jobs);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 204);
  assert.ok(result.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'TRACKER_QUEUE_FULL'));
  await sleep(1); assert.deepEqual(dispatcher.snapshot(), { active: 0, queued: 0 });
});

test('native fetch body reading is aborted and frees its dispatcher slot', async () => {
  let received = false;
  const server = createServer((_req, res) => {
    received = true; res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{');
  });
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const dispatcher = new TrackerDispatcher({ ...settings, requestTimeoutMs: 200 });
  const transport = new TrackerTransport(dispatcher, { operationTimeoutMs: 2000, maxRetries: 0 });
  try {
    await assert.rejects(transport.json(`http://127.0.0.1:${port}/v3/issues/TEST-1`),
      (error: TrackerLoadError) => error.code === 'TRACKER_REQUEST_TIMEOUT');
    assert.equal(received, true);
    await sleep(1); assert.deepEqual(dispatcher.snapshot(), { active: 0, queued: 0 });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  assert.equal(trackerLoadMessage({ status: 429 }), undefined); // A Messenger failure is not a Tracker failure.
  assert.match(trackerLoadMessage(new TrackerHttpError(429))!, /Tracker/);
});

test('start frequency is limited independently of concurrency', async () => {
  const dispatcher = new TrackerDispatcher({ ...settings, minIntervalMs: 12 });
  const starts: number[] = [];
  await Promise.all(Array.from({ length: 5 }, () => dispatcher.run(async () => { starts.push(performance.now()); })));
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 10);
});

test('queue wait expires, active request times out, cancellation removes waiting jobs', async () => {
  const dispatcher = new TrackerDispatcher({ ...settings, concurrency: 1, queueTimeoutMs: 20, requestTimeoutMs: 60 });
  const first = dispatcher.run(() => new Promise<never>(() => {}));
  const controller = new AbortController();
  const cancelled = dispatcher.run(async () => 2, controller.signal);
  const cancelledCheck = assert.rejects(cancelled);
  controller.abort();
  const queued = dispatcher.run(async () => 3);
  await Promise.all([
    assert.rejects(first, (e: TrackerLoadError) => e.code === 'TRACKER_REQUEST_TIMEOUT'),
    assert.rejects(queued, (e: TrackerLoadError) => e.code === 'TRACKER_QUEUE_TIMEOUT'), cancelledCheck
  ]);
  await sleep(1); assert.deepEqual(dispatcher.snapshot(), { active: 0, queued: 0 });
});

test('429 applies a shared cooldown, honors Retry-After, and counts attempts only once', async () => {
  const dispatcher = new TrackerDispatcher({ ...settings, concurrency: 1 });
  const starts: number[] = []; let attempts = 0;
  const transport = new TrackerTransport(dispatcher, { operationTimeoutMs: 2000, maxRetries: 2 }, (async () => {
    starts.push(performance.now()); attempts++;
    return attempts === 1 ? new Response('', { status: 429, headers: { 'retry-after': '0.08' } }) : new Response('{}');
  }) as typeof fetch);
  const a = newRequestMetrics(), b = newRequestMetrics();
  await Promise.all([
    requestMetrics.run(a, () => transport.json('https://tracker.test/v3/issues/_search', { method: 'POST' })),
    requestMetrics.run(b, () => transport.json('https://tracker.test/v3/users/1'))
  ]);
  assert.ok(starts[1] - starts[0] >= 75);
  assert.equal(a.trackerRequests, 2); assert.equal(a.tracker429, 1); assert.equal(b.trackerRequests, 1);
  assert.equal(retryDelay(new Headers({ 'retry-after': '2' }), 0, 0, 0), 2000);
  assert.equal(retryDelay(new Headers({ 'retry-after': 'Thu, 01 Jan 1970 00:00:03 GMT' }), 0, 1000, 0), 2000);
  assert.equal(retryDelay(new Headers({ 'retry-after': 'bad' }), 1, 0, 0), 2000);
});

test('no retries for writes or 5xx; attempt, operation and My day deadlines are bounded', async () => {
  let calls = 0;
  const transport = new TrackerTransport(new TrackerDispatcher(settings), { operationTimeoutMs: 1000, maxRetries: 2 },
    (async () => { calls++; return new Response('', { status: 429, headers: { 'retry-after': '0' } }); }) as typeof fetch);
  await assert.rejects(transport.json('https://tracker.test/v3/entities/report/', { method: 'POST' }));
  assert.equal(calls, 1);
  assert.equal(safeToRetry('https://tracker.test/v3/issues/_search', 'POST'), true);
  assert.equal(safeToRetry('https://tracker.test/v3/entities/report/', 'POST'), false);
  const five = new TrackerTransport(new TrackerDispatcher(settings), { operationTimeoutMs: 1000, maxRetries: 2 },
    (async () => { calls++; return new Response('', { status: 503 }); }) as typeof fetch);
  await assert.rejects(five.json('https://tracker.test/v3/users/1')); assert.equal(calls, 2);
  const stuck = new TrackerTransport(new TrackerDispatcher({ ...settings, requestTimeoutMs: 20 }),
    { operationTimeoutMs: 1000, maxRetries: 0 }, (() => new Promise(() => {})) as typeof fetch);
  const metrics = newRequestMetrics();
  await assert.rejects(requestMetrics.run(metrics, () => stuck.json('https://tracker.test/v3/users/1')),
    (e: TrackerLoadError) => e.code === 'TRACKER_REQUEST_TIMEOUT');
  assert.equal(metrics.trackerTimeouts, 1);
  const paused = new TrackerDispatcher(settings); paused.pause(1000);
  const slow = new TrackerTransport(paused, { operationTimeoutMs: 20, maxRetries: 0 });
  await assert.rejects(slow.json('https://tracker.test/v3/users/1'), (e: TrackerLoadError) => e.code === 'TRACKER_OPERATION_TIMEOUT');
  assert.equal(paused.snapshot().queued, 0);
  await assert.rejects(withTrackerDeadline(10, () => stuck.json('https://tracker.test/v3/users/1')),
    (e: TrackerLoadError) => e.code === 'MY_DAY_TIMEOUT');
});
