import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DigestStore, DigestJob } from './digest.store';
import { DigestScheduler } from './digest.scheduler';
import { morningWindow } from './digest-calendar';
import { DigestSubscriptions } from './digest-subscriptions';
import { ScheduledSendError } from '../../interfaces/yandex-messenger/yandex-messenger.client';

const nowAt = (time = '10:05:00') => Date.parse(`2026-11-03T${time}+03:00`);
const options = { enabled: true, intervalMs: 10_000, loadTimeoutMs: 1000, allowlist: ['*'] };
const message = { text: 'Report' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test('400 contacts: bounded spaced claims, persisted uniqueness, allowlist and opt-out', () => {
  const store = new DigestStore(':memory:');
  try {
    const now = nowAt(); const window = morningWindow(now);
    for (let i = 0; i < 400; i++) store.recordContact(`user-${i}@example.test`, `id-${i}`, now);
    store.setEnabled('user-2@example.test', false, now);
    store.recordContact('user-2@example.test', 'id-2', now); // subsequent clicks must NOT resubscribe
    store.seed(window.date, window.start, window.end, ['*'], now);
    store.seed(window.date, window.start, window.end, ['*'], now);
    assert.deepEqual(store.counts().map((row) => [row.state, row.total]), [['pending', 399]]);
    assert.equal(store.claim(now, 10_000, []), undefined);
    const first = store.claim(now, 10_000, ['user-1@example.test'])!;
    assert.equal(first.login, 'user-1@example.test');
    store.finish(first, 'sent', now);
    assert.equal(store.claim(now + 9999, 10_000, ['*']), undefined);
    const second = store.claim(now + 10000, 10_000, ['*'])!;
    assert.notEqual(second.id, first.id);
    store.finish(second, 'sent', now + 10000);
    let sent = 2;
    for (let t = now + 20000; t < window.end; t += 10000) {
      const job = store.claim(t, 10_000, ['*']);
      if (job) { store.finish(job, 'sent', t); sent++; }
    }
    assert.ok(sent <= 150, 'catch-up cannot start 400 loads at once');
    store.recover(window.end);
    assert.ok(store.counts().some((row) => row.state === 'expired'));
    assert.equal(store.claim(window.end, 10_000, ['*']), undefined);
  } finally { store.close(); }
});

test('contacts/preferences/jobs survive restart; recover build safely but never blindly resend interrupted POST', () => {
  const directory = mkdtempSync(join(tmpdir(), 'digest-jobs-'));
  const path = join(directory, 'digest.sqlite');
  let store = new DigestStore(path);
  try {
    const now = nowAt(); const window = morningWindow(now);
    store.recordContact('one', '1', now); store.recordContact('two', '2', now); store.recordContact('off', '3', now);
    store.setEnabled('off', false, now);
    store.seed(window.date, window.start, window.end, ['*'], now);
    const build = store.claim(now, 1000, ['one'])!;
    const sending = store.claim(now + 1000, 1000, ['two'])!;
    assert.equal(store.startSending(sending, now + 1000), true);
    store.close(); store = new DigestStore(path);
    assert.equal(store.recipient('off')?.enabled, false);
    store.recover(now + 181000);
    assert.equal(store.state(build.id), 'pending');
    assert.equal(store.state(sending.id), 'uncertain');
    const again = store.claim(now + 181000, 1000, ['*'])!;
    assert.equal(again.id, build.id);
    assert.equal(again.attempts, 2);
    store.recordContact('one', 'changed-id', now + 181000);
    assert.equal(store.recipient('one')?.enabled, false);
    assert.equal(store.startSending(again, now + 181000), false);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('scheduler gates weekdays/window/enable/allowlist, sends daily even an empty report and does not repeat', async () => {
  const store = new DigestStore(':memory:');
  let now = nowAt('08:59:59'); let builds = 0; let sends = 0;
  store.recordContact('pilot', '1', now); store.recordContact('other', '2', now);
  const scheduler = new DigestScheduler(store, { ...options, allowlist: ['pilot'] },
    async () => { builds++; return message; }, async (_job, report, signal) => {
      sends++; assert.equal(signal.aborted, false); assert.match(report.payloadId!, /^daily-/);
    }, () => now);
  try {
    await scheduler.tick(); assert.equal(builds, 0);
    now = Date.parse('2026-11-07T10:05:00+03:00'); await scheduler.tick(); assert.equal(builds, 0);
    now = nowAt(); await scheduler.tick();
    assert.equal(builds, 1); assert.equal(sends, 1);
    now += 10000; await scheduler.tick(); assert.equal(sends, 1);
    now = nowAt('10:30:00'); await scheduler.tick(); assert.equal(sends, 1);
    const disabled = new DigestScheduler(store, { ...options, enabled: false }, async () => { throw new Error('disabled'); },
      async () => { throw new Error('disabled'); }, () => nowAt());
    await disabled.tick();
  } finally { scheduler.stop(); store.close(); }
});

test('scheduler has one build at a time and rechecks opt-out before sending', async () => {
  const store = new DigestStore(':memory:');
  const gate = deferred<void>(); const started = deferred<void>();
  const now = nowAt(); let builds = 0; let sends = 0;
  store.recordContact('pilot', '1', now);
  const scheduler = new DigestScheduler(store, options, async () => {
    builds++; started.resolve(); await gate.promise; return message;
  }, async () => { sends++; }, () => now);
  try {
    const pending = scheduler.tick(); await started.promise;
    await scheduler.tick(); assert.equal(builds, 1);
    store.setEnabled('pilot', false, now);
    gate.resolve(); await pending;
    assert.equal(sends, 0);
    assert.ok(store.counts().some((row) => row.state === 'cancelled'));
  } finally { scheduler.stop(); store.close(); }
});

test('data failures retry with bounds, never send false zeros, and do not send after the window', async () => {
  const store = new DigestStore(':memory:');
  let now = nowAt(); let builds = 0; let sends = 0;
  store.recordContact('pilot', '1', now);
  const scheduler = new DigestScheduler(store, options, async () => {
    builds++; throw new Error('SECRET Tracker URL and task data');
  }, async () => { sends++; }, () => now);
  try {
    await scheduler.tick(); assert.equal(builds, 1); assert.equal(sends, 0);
    now += 59000; await scheduler.tick(); assert.equal(builds, 1);
    now += 1000; await scheduler.tick(); assert.equal(builds, 2);
    now += 120000; await scheduler.tick(); assert.equal(builds, 3);
    now += 300000; await scheduler.tick(); assert.equal(builds, 3);
    assert.ok(store.counts().some((row) => row.state === 'failed'));
    assert.equal(sends, 0);
  } finally { scheduler.stop(); store.close(); }
  const endStore = new DigestStore(':memory:'); now = nowAt('10:29:59');
  endStore.recordContact('late', '1', now);
  const late = new DigestScheduler(endStore, options, async () => { now += 2000; return message; },
    async () => { sends++; }, () => now);
  try { await late.tick(); assert.equal(sends, 0); assert.ok(endStore.counts().some((row) => row.state === 'expired')); }
  finally { late.stop(); endStore.close(); }
});

test('Messenger 429 waits and retries; timeout/5xx delivery is uncertain and never automatically retried', async () => {
  for (const error of [new ScheduledSendError(429, 90000), new Error('timeout'), new ScheduledSendError(503), new ScheduledSendError(403)]) {
    const store = new DigestStore(':memory:');
    let now = nowAt(); let sends = 0;
    store.recordContact('pilot', '1', now);
    let jobId = '';
    const build = async (job: DigestJob) => { jobId = job.id; return message; };
    const scheduler = new DigestScheduler(store, options, build, async () => { sends++; throw error; }, () => now);
    try {
      await scheduler.tick(); assert.equal(sends, 1);
      now += 10000; await scheduler.tick(); assert.equal(sends, 1);
      if (error instanceof ScheduledSendError && error.status === 429) {
        assert.equal(store.state(jobId), 'pending');
        const restarted = new DigestScheduler(store, options, build, async () => { sends++; }, () => now);
        await restarted.tick(); assert.equal(sends, 1); // cooldown lives in SQLite, not only the process
        now += 80000; await restarted.tick(); assert.equal(sends, 2);
        assert.equal(store.state(jobId), 'sent'); restarted.stop();
      } else {
        assert.equal(store.state(jobId), error instanceof ScheduledSendError && error.status === 403 ? 'failed' : 'uncertain');
        now += 120000; await scheduler.tick(); assert.equal(sends, 1);
      }
    } finally { scheduler.stop(); store.close(); }
  }
});

test('subscription settings distinguish disabled service/pilot and never resubscribe on contact', () => {
  const store = new DigestStore(':memory:');
  try {
    const subscriptions = new DigestSubscriptions(store, false, ['pilot']);
    subscriptions.disable('first-contact');
    subscriptions.recordContact('first-contact', 'new-id');
    assert.equal(store.recipient('first-contact')?.enabled, false, 'a first-message opt-out survives later registration/import');
    subscriptions.recordContact('user', '1');
    assert.match(subscriptions.handleCommand('настройки дайджеста', 'user')!.text, /не запущена/);
    subscriptions.disable('user'); subscriptions.recordContact('user', '1');
    assert.equal(store.recipient('user')?.enabled, false);
    subscriptions.handleCommand('включить дайджест', 'user');
    assert.equal(store.recipient('user')?.enabled, true);
    assert.match(new DigestSubscriptions(store, true, ['pilot']).handleCommand('настройки дайджеста', 'user')!.text, /пока не включён/);
  } finally { store.close(); }
});
