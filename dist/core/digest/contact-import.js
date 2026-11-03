"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.privateContactsFromAnalytics = privateContactsFromAnalytics;
const node_sqlite_1 = require("node:sqlite");
/** Positive evidence only: these successful scenarios occur after BOTH private-chat and identity gates.
 * Diagnostics (whoami can run before identity), groups, unknown senders and failed requests are excluded.
 * Never assume every row in analytics.users is a deliverable private contact.
 */
function privateContactsFromAnalytics(path) {
    const db = new node_sqlite_1.DatabaseSync(path, { readOnly: true });
    try {
        if (db.prepare('PRAGMA user_version').get()?.user_version !== 2)
            throw new Error('UNSUPPORTED_ANALYTICS_SCHEMA');
        const rows = db.prepare(`SELECT DISTINCT lower(trim(u.login)) AS login FROM users u
      JOIN activities a ON a.user_key=u.user_key WHERE a.outcome='replied'
      AND a.scenario IN ('menu','my_day','team','changes','digest','issue_help','issue_analysis','risks','health','preview')
      ORDER BY login LIMIT 10001`).all();
        if (rows.length > 10000)
            throw new Error('TOO_MANY_IMPORT_CONTACTS');
        return rows.map((row) => String(row.login)).filter((login) => login.length <= 254 && /^[\p{L}\p{N}_.@+-]+$/u.test(login));
    }
    finally {
        db.close();
    }
}
