import { existsSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [source, destination] = process.argv.slice(2);
if (!source || !destination || !existsSync(source) || existsSync(destination)) {
  console.error('Usage: node dist/tools/analytics-backup.js EXISTING_DB NEW_BACKUP_PATH');
  process.exitCode = 1;
} else {
  let db: DatabaseSync | undefined;
  try {
    // Do not construct AnalyticsStore: a backup must not mark live requests interrupted.
    db = new DatabaseSync(resolve(source));
    db.exec('PRAGMA busy_timeout=5000');
    db.prepare('VACUUM INTO ?').run(resolve(destination));
    if (process.platform !== 'win32') chmodSync(resolve(destination), 0o600);
    console.info('analytics.backup_complete');
  } catch {
    console.error('analytics.backup_failed'); process.exitCode = 1;
  } finally { db?.close(); }
}
