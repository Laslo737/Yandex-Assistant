"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DigestStore = void 0;
const node_sqlite_1 = require("node:sqlite");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_crypto_1 = require("node:crypto");
const digest_calendar_1 = require("./digest-calendar");
/** One application process per database; no task bodies or message text are persisted here. */
class DigestStore {
    db;
    constructor(path) {
        if (path !== ':memory:')
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)((0, node_path_1.resolve)(path)), { recursive: true, mode: 0o700 });
        this.db = new node_sqlite_1.DatabaseSync(path);
        this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;');
        const version = this.db.prepare('PRAGMA user_version').get()?.user_version;
        if (version !== 0 && version !== 1) {
            this.db.close();
            throw new Error('UNKNOWN_DIGEST_SCHEMA');
        }
        this.db.exec(`BEGIN;
      CREATE TABLE IF NOT EXISTS recipients (
        login TEXT PRIMARY KEY, tracker_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, login TEXT NOT NULL, tracker_id TEXT NOT NULL, date TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
        error_code TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
        UNIQUE(login,date)
      );
      CREATE INDEX IF NOT EXISTS digest_due ON jobs(state,due_at);
      CREATE INDEX IF NOT EXISTS digest_updated ON jobs(updated_at);
      CREATE TABLE IF NOT EXISTS scheduler (key TEXT PRIMARY KEY,value INTEGER NOT NULL);
      PRAGMA user_version=1; COMMIT;`);
    }
    recordContact(login, trackerId, now = Date.now()) {
        if (!/^[\p{L}\p{N}_.@+-]+$/u.test(login.trim()) || login.trim().length > 254 || !trackerId) {
            throw new Error('INVALID_DIGEST_CONTACT');
        }
        // Never silently re-subscribe an opted-out user. Rebinding an identity requires explicit opt-in.
        this.db.prepare(`INSERT INTO recipients VALUES (?,?,1,?,?) ON CONFLICT(login) DO UPDATE SET
      enabled=CASE WHEN recipients.tracker_id=excluded.tracker_id THEN recipients.enabled ELSE 0 END,
      tracker_id=excluded.tracker_id,last_seen=excluded.last_seen`)
            .run(login.trim().toLowerCase(), trackerId, now, now);
    }
    recipient(login) {
        const row = this.db.prepare('SELECT * FROM recipients WHERE login=?').get(login.trim().toLowerCase());
        return row ? { login: String(row.login), trackerId: String(row.tracker_id), enabled: Boolean(row.enabled) } : undefined;
    }
    setEnabled(login, enabled, now = Date.now()) {
        const normalized = login.trim().toLowerCase();
        if (!enabled) {
            if (!/^[\p{L}\p{N}_.@+-]+$/u.test(normalized) || normalized.length > 254)
                throw new Error('INVALID_DIGEST_CONTACT');
            // A first-ever message may be an opt-out while Tracker is down. Keep a tombstone,
            // otherwise the next normal contact/import would silently subscribe this person.
            this.db.prepare(`INSERT INTO recipients VALUES (?,'',0,?,?) ON CONFLICT(login) DO UPDATE SET enabled=0`)
                .run(normalized, now, now);
            this.db.prepare(`UPDATE jobs SET state='cancelled',updated_at=?
        WHERE login=? AND state IN ('pending','building')`).run(now, normalized);
            return true;
        }
        return Boolean(this.db.prepare("UPDATE recipients SET enabled=1 WHERE login=? AND tracker_id<>''").run(normalized).changes);
    }
    seed(date, start, end, allowlist, now) {
        const allowed = new Set(allowlist.map((login) => login.trim().toLowerCase()));
        const recipients = this.db.prepare('SELECT login,tracker_id FROM recipients WHERE enabled=1 ORDER BY login').all();
        const insert = this.db.prepare(`INSERT OR IGNORE INTO jobs
      (id,login,tracker_id,date,due_at,expires_at,updated_at) VALUES (?,?,?,?,?,?,?)`);
        this.db.exec('BEGIN');
        try {
            for (const row of recipients) {
                const login = String(row.login);
                if (!allowed.has('*') && !allowed.has(login))
                    continue;
                const id = (0, node_crypto_1.createHash)('sha256').update(`morning:${date}:${login}`).digest('hex').slice(0, 32);
                insert.run(id, login, row.tracker_id, date, (0, digest_calendar_1.deliverySlot)(login, date, start, end), end, now);
            }
            this.db.exec('COMMIT');
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    recover(now) {
        // A build has no external side effect and may be retried. A send may have reached Messenger:
        // never automatically retry ambiguous delivery (payload_id is NOT assumed idempotent).
        this.db.prepare(`UPDATE jobs SET state='uncertain',error_code='INTERRUPTED_SEND',updated_at=?
      WHERE state='sending' AND lease_until<=?`).run(now, now);
        this.db.prepare(`UPDATE jobs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,
      error_code='INTERRUPTED_BUILD',updated_at=? WHERE state='building' AND lease_until<=?`).run(now, now);
        this.db.prepare(`UPDATE jobs SET state='expired',updated_at=? WHERE state IN ('pending','building') AND expires_at<=?`).run(now, now);
        // Delivery diagnostics are bounded; recipients/preferences are not expired.
        this.db.prepare('DELETE FROM jobs WHERE updated_at<? AND state NOT IN (\'building\',\'sending\')').run(now - 90 * 86400_000);
    }
    claim(now, intervalMs, allowlist) {
        this.db.exec('BEGIN IMMEDIATE');
        try {
            const next = Number(this.db.prepare("SELECT value FROM scheduler WHERE key='next_start'").get()?.value || 0);
            if (next > now) {
                this.db.exec('COMMIT');
                return undefined;
            }
            const allowed = new Set(allowlist.map((login) => login.trim().toLowerCase()));
            const rows = this.db.prepare(`SELECT j.* FROM jobs j JOIN recipients r ON r.login=j.login
        WHERE j.state='pending' AND j.due_at<=? AND j.expires_at>? AND r.enabled=1 AND r.tracker_id=j.tracker_id
        ORDER BY j.due_at,j.id`).all(now, now);
            const row = rows.find((item) => allowed.has('*') || allowed.has(String(item.login)));
            if (!row) {
                this.db.exec('COMMIT');
                return undefined;
            }
            this.db.prepare(`UPDATE jobs SET state='building',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=?`)
                .run(now + 180_000, now, row.id);
            this.db.prepare("INSERT INTO scheduler VALUES ('next_start',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
                .run(now + intervalMs);
            this.db.exec('COMMIT');
            return { id: String(row.id), login: String(row.login), trackerId: String(row.tracker_id), date: String(row.date),
                attempts: Number(row.attempts) + 1, expiresAt: Number(row.expires_at) };
        }
        catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
    }
    startSending(job, now) {
        return Boolean(this.db.prepare(`UPDATE jobs SET state='sending',lease_until=?,updated_at=? WHERE id=? AND state='building'
      AND expires_at>? AND EXISTS (SELECT 1 FROM recipients r WHERE r.login=jobs.login AND r.enabled=1 AND r.tracker_id=jobs.tracker_id)`)
            .run(now + 60_000, now, job.id, now).changes);
    }
    finish(job, state, now, code = '', retryAt) {
        // Do not overwrite a cancellation that occurred while data was being collected.
        this.db.prepare(`UPDATE jobs SET state=?,updated_at=?,error_code=?,due_at=COALESCE(?,due_at)
      WHERE id=? AND state IN ('building','sending')`).run(state, now, code, retryAt ?? null, job.id);
    }
    pauseUntil(until) {
        this.db.prepare("INSERT INTO scheduler VALUES ('next_start',?) ON CONFLICT(key) DO UPDATE SET value=MAX(value,excluded.value)").run(until);
    }
    state(id) { return this.db.prepare('SELECT state FROM jobs WHERE id=?').get(id)?.state; }
    counts() { return this.db.prepare('SELECT state,COUNT(*) AS total FROM jobs GROUP BY state').all(); }
    close() { this.db.close(); }
}
exports.DigestStore = DigestStore;
