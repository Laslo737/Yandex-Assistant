import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AnalyticsStore } from './analytics.store';
import { DatabaseSync } from 'node:sqlite';
import { newRequestMetrics, requestMetrics } from './request-metrics';
import { TrackerLoadError } from '../../integrations/yandex-tracker/tracker-load';
import { AnalyticsService, safeErrorCode } from './analytics.service';
import { Activity } from './analytics.types';
import { YandexMessengerEvent } from '../../interfaces/yandex-messenger/yandex-messenger.types';

function activity(id: string, ms = 100): Activity {
  return { requestId: id, eventHash: id, userKey: 'user', login: 'test@example.com',
    startedAt: new Date().toISOString(), scenario: 'my_day', outcome: 'replied', durationMs: ms, errorCode: '' };
}
function event(id: string): YandexMessengerEvent {
  return { eventId: id, type: 'message', text: 'SECRET MESSAGE IT-123', from: { login: 'test@example.com' },
    chat: { type: 'private' }, threadId: null, replyTarget: {}, metadata: { providerEventType: null }, raw: {} };
}
const since = '2000-01-01T00:00:00.000Z';

test('diagnostic error codes never copy messages, URLs, tokens or arbitrary codes', () => {
  assert.equal(safeErrorCode({ status: 429, message: 'SECRET' }, 'FAILED'), 'HTTP_429');
  assert.equal(safeErrorCode({ status: '429 SECRET', code: 'SECRET' }, 'FAILED'), 'FAILED');
  assert.equal(safeErrorCode({ name: 'TimeoutError' }, 'FAILED'), 'REQUEST_TIMEOUT_OR_ABORT');
  assert.equal(safeErrorCode(new Error('SECRET'), 'FAILED'), 'FAILED');
  assert.equal(safeErrorCode(null, 'FAILED'), 'FAILED');
  assert.equal(safeErrorCode(new TrackerLoadError('TRACKER_QUEUE_FULL'), 'FAILED'), 'TRACKER_QUEUE_FULL');
});

test('store: deduplication, statistics, literal filters and pagination', () => {
  const store = new AnalyticsStore(':memory:');
  try {
    for (let i = 1; i <= 40; i++) {
      const row = activity(`id-${i}`, i * 100);
      if (i === 40) row.outcome = 'service_error';
      assert.equal(store.begin(row), true); store.finish(row);
      assert.equal(store.begin(row), false);
    }
    const summary = store.overview(since);
    assert.equal(summary.totals.total, 40);
    assert.equal(summary.totals.users, 1);
    assert.equal(summary.totals.errors, 1);
    assert.equal(summary.latency.median, 2050);
    assert.equal(summary.latency.p95, 3800);
    assert.equal(store.activities({ since, page: 2 }).rows.length, 10);
    assert.equal(store.activities({ since, outcome: 'service_error' }).total, 1);
    assert.equal(store.activities({ since, requestId: "' OR 1=1 --" }).total, 0);
    assert.equal(store.users(since, '%').total, 0);
    assert.equal(store.users(since, 'EXAMPLE.COM').total, 1);
    assert.equal(store.users(since, "' OR 1=1 --").total, 0);
  } finally { store.close(); }
});

test('schema v1 migrates to v2 without losing history and persists load metrics across restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'copilot-migration-'));
  const path = join(directory, 'events.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE users (user_key TEXT PRIMARY KEY, login TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL);
    CREATE TABLE activities (request_id TEXT PRIMARY KEY,event_hash TEXT NOT NULL UNIQUE,user_key TEXT NOT NULL REFERENCES users(user_key),
      started_at TEXT NOT NULL,scenario TEXT NOT NULL,outcome TEXT NOT NULL,duration_ms INTEGER NOT NULL DEFAULT 0,error_code TEXT NOT NULL DEFAULT '');
    INSERT INTO users VALUES ('old','old@example.test','2025-01-01','2099-01-01');
    INSERT INTO activities VALUES ('old','old','old','2099-01-01','my_day','replied',100,''); PRAGMA user_version=1;`);
  legacy.close();
  let store = new AnalyticsStore(path);
  try {
    assert.equal(store.activities({ since }).rows[0].metrics_recorded, 0);
    const service = new AnalyticsService(store);
    await service.track(event('new'), async () => {
      const m = requestMetrics.getStore()!;
      Object.assign(m, newRequestMetrics(), { dataSource: 'cache', trackerRequests: 2, tracker429: 1, queueWaitMs: 100 });
      service.replied();
    });
    store.close(); store = new AnalyticsStore(path);
    const summary = store.overview(since);
    assert.equal(summary.totals.total, 2);
    assert.equal(summary.load.measured, 1); assert.equal(summary.load.requests, 2);
    assert.equal(summary.load.cache_hits, 1); assert.equal(summary.load.rate_limited, 1);
    assert.equal(summary.load.queue_ms, 100);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('store: restart persistence, consistent backup and retention', () => {
  const directory = mkdtempSync(join(tmpdir(), 'copilot-analytics-'));
  const path = join(directory, 'events.sqlite');
  let store = new AnalyticsStore(path, 2);
  try {
    store.begin(activity('pending'));
    const old = activity('old'); old.startedAt = new Date(Date.now() - 4 * 86400_000).toISOString();
    store.begin(old); store.finish(old);
    store.close(); store = new AnalyticsStore(path, 2);
    assert.equal(store.activities({ since }).total, 1);
    assert.equal(store.activities({ since }).rows[0].outcome, 'interrupted');
    const snapshot = join(directory, 'backup.sqlite'); store.backup(snapshot);
    const restored = new AnalyticsStore(snapshot, 2);
    assert.equal(restored.activities({ since }).total, 1); restored.close();
    store.cleanup(Date.now() + 3 * 86400_000);
    assert.equal(store.activities({ since }).total, 0);
    assert.equal(store.users(since).total, 0);
    const saved = store.users(null).rows[0];
    assert.equal(store.users(null).total, 1);
    assert.equal(saved.total, 0);
    assert.equal(saved.errors, 0);
    store.close(); store = new AnalyticsStore(path, 2);
    assert.deepEqual(store.users(null).rows[0], saved);
    const usersSnapshot = join(directory, 'users-backup.sqlite'); store.backup(usersSnapshot);
    const usersRestored = new AnalyticsStore(usersSnapshot, 2);
    try { assert.deepEqual(usersRestored.users(null).rows[0], saved); } finally { usersRestored.close(); }
    const returning = activity('returning'); returning.startedAt = new Date(Date.now() + 4 * 86400_000).toISOString();
    returning.login = 'renamed@example.com';
    store.begin(returning); store.finish(returning);
    const updated = store.users(null).rows[0];
    assert.equal(updated.first_seen, saved.first_seen);
    assert.equal(updated.last_seen, returning.startedAt);
    assert.equal(updated.login, returning.login);
    assert.equal(updated.total, 1);
    assert.equal(store.users(null).total, 1);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('all users: expired events keep identities, zero counts, literal search and pagination', () => {
  const store = new AnalyticsStore(':memory:', 2);
  try {
    const oldDate = new Date(Date.now() - 4 * 86400_000).toISOString();
    for (let i = 0; i < 35; i++) {
      const row = { ...activity(`old-${i}`), userKey: `old-${i}`, login: `old-${i}@example.test`, startedAt: oldDate };
      store.begin(row); store.finish(row);
    }
    const active = { ...activity('active'), userKey: 'active', login: 'active@example.test' };
    store.begin(active); store.finish(active);
    store.cleanup(Date.now() + 3600_000);
    assert.equal(store.activities({ since }).total, 1);
    assert.equal(store.users(since).total, 1);
    assert.equal(store.users(null).total, 36);
    const firstPage = store.users(null).rows;
    const secondPage = store.users(null, '', 2).rows;
    assert.equal(firstPage.length, 30);
    assert.equal(secondPage.length, 6);
    assert.equal(new Set([...firstPage, ...secondPage].map((row) => row.user_key)).size, 36);
    assert.equal(firstPage[0].user_key, 'active');
    assert.equal(firstPage[0].total, 1);
    assert.equal(firstPage[1].total, 0);
    assert.equal(firstPage[1].errors, 0);
    assert.equal(firstPage[1].first_seen, oldDate);
    assert.equal(firstPage[1].last_seen, oldDate);
    assert.equal(store.users(null, 'OLD-').total, 35);
    assert.equal(store.users(null, '%').total, 0);
    assert.equal(store.users(null, "' OR 1=1 --").total, 0);
  } finally { store.close(); }
});

test('telemetry isolates concurrent requests, stores no messages and keeps delivery errors', async () => {
  const store = new AnalyticsStore(':memory:'); const service = new AnalyticsService(store);
  try {
    await Promise.all([
      service.track(event('one'), async () => { service.scenario('my_day'); await new Promise((r) => setTimeout(r, 10)); service.replied(); }),
      service.track(event('two'), async () => { service.scenario('issue_analysis'); service.outcome('access_denied', 'NO_PERMISSION'); service.replied(); })
    ]);
    await assert.rejects(service.track(event('three'), async () => {
      service.outcome('delivery_error', 'MESSENGER_SEND_FAILED'); throw new Error('SECRET API TOKEN');
    }));
    await service.track(event('one'), async () => { service.replied(); });
    const rows = store.activities({ since }).rows;
    assert.equal(rows.length, 3);
    assert.equal(rows.find((r) => r.scenario === 'my_day')?.outcome, 'replied');
    assert.equal(rows.find((r) => r.scenario === 'issue_analysis')?.outcome, 'access_denied');
    assert.equal(rows.filter((r) => r.outcome === 'delivery_error').length, 1);
    assert.doesNotMatch(JSON.stringify(rows), /SECRET|IT-123/);
  } finally { store.close(); }
});

test('telemetry storage failure does not stop handler or change its return value', async () => {
  const store = new AnalyticsStore(':memory:'); store.close();
  const service = new AnalyticsService(store);
  assert.equal(await service.track(event('x'), async () => 42), 42);
});
