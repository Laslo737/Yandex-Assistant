import assert from 'node:assert/strict';
import test from 'node:test';
import { env } from '../../config/env';
import { createApp } from '../../app';

// Isolated test worker: fixtures never reach external APIs and stores are in-memory.
env.admin.enabled = false;
env.yandexMessenger.enabled = true;
env.yandexMessenger.key = 'fixture-only';
env.tracker.enabled = true;
env.tracker.oauthToken = 'fixture-only';
env.tracker.orgId = 'fixture-only';
env.app.publicBaseUrl = 'https://assistant.example.test';
env.admin.databasePath = ':memory:';
env.app.shortLinksDatabasePath = ':memory:';
env.digest.databasePath = ':memory:';
env.digest.intervalMs = 10000;
env.digest.loadTimeoutMs = 60000;

test('sending cannot be enabled without explicit allowlist; createApp does not start the worker', () => {
  env.digest.enabled = true;
  env.digest.allowlist = [];
  assert.throws(() => createApp(), /DIGEST_ALLOWLIST_REQUIRED/);
  env.digest.allowlist = ['pilot@example.test'];
  const app = createApp();
  assert.ok(app.locals.digestScheduler);
  assert.equal(app.locals.digestScheduler.timer, undefined);
  app.locals.digestScheduler.stop();
  env.digest.enabled = false;
});

test('scheduled sending rejects missing integrations and reused database files', () => {
  env.digest.enabled = true;
  env.digest.allowlist = ['pilot@example.test'];
  env.tracker.enabled = false;
  assert.throws(() => createApp(), /REQUIRES_MESSENGER_TRACKER_AND_HTTPS/);
  env.tracker.enabled = true;
  env.admin.databasePath = './fixture.sqlite';
  env.digest.databasePath = './fixture.sqlite';
  assert.throws(() => createApp(), /SEPARATE_DATABASE_FILES/);
  env.admin.databasePath = ':memory:'; env.digest.databasePath = ':memory:';
  env.digest.enabled = false;
});
