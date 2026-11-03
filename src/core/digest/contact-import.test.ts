import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { privateContactsFromAnalytics } from './contact-import';

test('legacy contact import requires positive successful private scenario evidence; analytics is read-only', () => {
  const directory = mkdtempSync(join(tmpdir(), 'digest-import-'));
  const path = join(directory, 'analytics.sqlite');
  const db = new DatabaseSync(path);
  try {
    db.exec(`PRAGMA user_version=2;
      CREATE TABLE users (user_key TEXT PRIMARY KEY,login TEXT);
      CREATE TABLE activities (user_key TEXT,scenario TEXT,outcome TEXT);
      INSERT INTO users VALUES ('ok','User@Example.Test'),('group','group'),('unknown','Неизвестный отправитель'),
        ('failed','failed'),('whoami','whoami'),('expired','expired'),('injected','bad Queue: SECRET');
      INSERT INTO activities VALUES ('ok','menu','replied'),('ok','my_day','replied'),('group','menu','group_rejected'),
        ('unknown','other','replied'),('failed','menu','identity_failed'),('whoami','diagnostics','replied'),('injected','menu','replied');`);
    assert.deepEqual(privateContactsFromAnalytics(path), ['user@example.test']);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get()?.n, 7);
    db.exec('PRAGMA user_version=1');
    assert.throws(() => privateContactsFromAnalytics(path), /UNSUPPORTED_ANALYTICS_SCHEMA/);
  } finally { db.close(); rmSync(directory, { recursive: true, force: true }); }
});
