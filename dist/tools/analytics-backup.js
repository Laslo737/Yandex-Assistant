"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_sqlite_1 = require("node:sqlite");
const [source, destination] = process.argv.slice(2);
if (!source || !destination || !(0, node_fs_1.existsSync)(source) || (0, node_fs_1.existsSync)(destination)) {
    console.error('Usage: node dist/tools/analytics-backup.js EXISTING_DB NEW_BACKUP_PATH');
    process.exitCode = 1;
}
else {
    let db;
    try {
        // Do not construct AnalyticsStore: a backup must not mark live requests interrupted.
        db = new node_sqlite_1.DatabaseSync((0, node_path_1.resolve)(source));
        db.exec('PRAGMA busy_timeout=5000');
        db.prepare('VACUUM INTO ?').run((0, node_path_1.resolve)(destination));
        if (process.platform !== 'win32')
            (0, node_fs_1.chmodSync)((0, node_path_1.resolve)(destination), 0o600);
        console.info('analytics.backup_complete');
    }
    catch {
        console.error('analytics.backup_failed');
        process.exitCode = 1;
    }
    finally {
        db?.close();
    }
}
