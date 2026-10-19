'use strict';
const { DatabaseSync } = require('node:sqlite');
let db;
try {
  if (!process.argv[2]) throw new Error('Missing snapshot path');
  db = new DatabaseSync(process.argv[2], { readOnly: true });
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Integrity failed');
  const count = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('users','activities','metadata')").get().n;
  if (count !== 3) throw new Error('Not an analytics database');
  console.info('BACKUP_INTEGRITY_OK');
} catch {
  console.error('BACKUP_CHECK_FAILED');
  process.exitCode = 1;
} finally {
  if (db) db.close();
}
