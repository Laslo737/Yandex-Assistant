"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_sqlite_1 = require("node:sqlite");
const env_1 = require("../config/env");
let db;
try {
    db = new node_sqlite_1.DatabaseSync(env_1.env.digest.databasePath, { readOnly: true });
    if (db.prepare('PRAGMA user_version').get()?.user_version !== 1)
        throw new Error('UNKNOWN_DIGEST_SCHEMA');
    console.info(JSON.stringify({ sendingEnabled: env_1.env.digest.enabled,
        rollout: env_1.env.digest.allowlist.includes('*') ? 'all-verified' : 'pilot',
        recipients: db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(enabled),0) AS subscribed FROM recipients').get(),
        recentJobs: db.prepare(`SELECT date,state,COUNT(*) AS total FROM jobs WHERE date>=?
      GROUP BY date,state ORDER BY date DESC,state`).all(new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10)),
        recentErrors: db.prepare(`SELECT error_code,COUNT(*) AS total FROM jobs WHERE error_code<>'' AND updated_at>=?
      GROUP BY error_code`).all(Date.now() - 7 * 86400_000)
    }, null, 2));
}
catch {
    console.error('DIGEST_STATUS_FAILED: check persistent DB configuration');
    process.exitCode = 1;
}
finally {
    db?.close();
}
