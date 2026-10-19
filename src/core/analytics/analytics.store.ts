import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Activity, ActivityFilter } from './analytics.types';
import { newRequestMetrics } from './request-metrics';

export const PAGE_SIZE = 30;
const ERROR_SQL = "('service_error','delivery_error','internal_error','interrupted')";

/** One local process per database. No Tracker content is accepted by this API. */
export class AnalyticsStore {
  private readonly db: DatabaseSync;
  private lastCleanup = 0;
  constructor(path: string, private readonly retentionDays = 90) {
    if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('INVALID_RETENTION');
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000; PRAGMA foreign_keys=ON;`);
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version;
    if (version !== 0 && version !== 1 && version !== 2) { this.db.close(); throw new Error('UNKNOWN_ANALYTICS_SCHEMA'); }
    this.db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        user_key TEXT PRIMARY KEY, login TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS activities (
        request_id TEXT PRIMARY KEY, event_hash TEXT NOT NULL UNIQUE,
        user_key TEXT NOT NULL REFERENCES users(user_key), started_at TEXT NOT NULL,
        scenario TEXT NOT NULL, outcome TEXT NOT NULL, duration_ms INTEGER NOT NULL DEFAULT 0,
        error_code TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS activity_time ON activities(started_at);
      CREATE INDEX IF NOT EXISTS activity_user_time ON activities(user_key, started_at);
      CREATE INDEX IF NOT EXISTS activity_scenario_time ON activities(scenario, started_at);
      CREATE INDEX IF NOT EXISTS activity_outcome_time ON activities(outcome, started_at);
      COMMIT;
    `);
    if (version !== 2) {
      try {
        this.db.exec(`BEGIN;
          ALTER TABLE activities ADD COLUMN metrics_recorded INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE activities ADD COLUMN data_source TEXT NOT NULL DEFAULT 'none';
          ALTER TABLE activities ADD COLUMN tracker_requests INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE activities ADD COLUMN tracker_429 INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE activities ADD COLUMN tracker_timeouts INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE activities ADD COLUMN queue_wait_ms INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE activities ADD COLUMN tracker_duration_ms INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE activities ADD COLUMN shared_wait_ms INTEGER NOT NULL DEFAULT 0;
          PRAGMA user_version=2;
          COMMIT;`);
      } catch (error) { this.db.exec('ROLLBACK'); this.db.close(); throw error; }
    }
    this.db.prepare('INSERT OR IGNORE INTO metadata VALUES (?, ?)').run('collection_started_at', new Date().toISOString());
    this.db.prepare("UPDATE activities SET outcome='interrupted', error_code='PROCESS_RESTART' WHERE outcome='processing'").run();
    this.cleanup();
  }

  begin(activity: Activity): boolean {
    this.cleanup();
    this.db.exec('BEGIN');
    try {
      if (this.db.prepare('SELECT 1 FROM activities WHERE event_hash=?').get(activity.eventHash)) {
        this.db.exec('ROLLBACK'); return false;
      }
      this.db.prepare(`INSERT INTO users VALUES (?, ?, ?, ?) ON CONFLICT(user_key) DO UPDATE SET
        login=excluded.login, last_seen=MAX(users.last_seen, excluded.last_seen)`)
        .run(activity.userKey, activity.login, activity.startedAt, activity.startedAt);
      this.db.prepare(`INSERT INTO activities (request_id,event_hash,user_key,started_at,scenario,outcome) VALUES (?,?,?,?,?,?)`)
        .run(activity.requestId, activity.eventHash, activity.userKey, activity.startedAt, activity.scenario, 'processing');
      this.db.exec('COMMIT'); return true;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  finish(activity: Activity) {
    const m = activity.metrics || newRequestMetrics();
    this.db.prepare(`UPDATE activities SET scenario=?, outcome=?, duration_ms=?, error_code=?,
      metrics_recorded=?, data_source=?, tracker_requests=?, tracker_429=?, tracker_timeouts=?,
      queue_wait_ms=?, tracker_duration_ms=?, shared_wait_ms=? WHERE request_id=?`)
      .run(activity.scenario, activity.outcome, activity.durationMs, activity.errorCode,
        activity.metrics ? 1 : 0, m.dataSource, m.trackerRequests, m.tracker429, m.trackerTimeouts,
        m.queueWaitMs, m.trackerDurationMs, m.sharedWaitMs, activity.requestId);
  }

  cleanup(now = Date.now()) {
    if (now - this.lastCleanup < 3600_000) return;
    const cutoff = new Date(now - this.retentionDays * 86400_000).toISOString();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM activities WHERE started_at < ?').run(cutoff);
      this.db.prepare('DELETE FROM users WHERE last_seen < ? AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.user_key=users.user_key)').run(cutoff);
      this.db.exec('COMMIT'); this.lastCleanup = now;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  overview(since: string) {
    const totals = this.db.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT user_key) AS users,
      COALESCE(SUM(outcome='replied'),0) AS replied,
      COALESCE(SUM(outcome='access_denied'),0) AS denied,
      COALESCE(SUM(outcome IN ${ERROR_SQL}),0) AS errors
      FROM activities WHERE started_at>=?`).get(since)!;
    const latency = this.db.prepare(`WITH ordered AS (
      SELECT duration_ms, ROW_NUMBER() OVER (ORDER BY duration_ms) AS rank, COUNT(*) OVER () AS n
      FROM activities WHERE started_at>=? AND outcome NOT IN ('processing','interrupted')
    ) SELECT AVG(CASE WHEN rank IN (CAST((n+1)/2 AS INTEGER), CAST((n+2)/2 AS INTEGER)) THEN duration_ms END) AS median,
      MAX(CASE WHEN rank=MAX(1,CAST((n*95+99)/100 AS INTEGER)) THEN duration_ms END) AS p95 FROM ordered`).get(since)!;
    const scenarios = this.db.prepare(`SELECT scenario, COUNT(*) AS total FROM activities WHERE started_at>=?
      GROUP BY scenario ORDER BY total DESC`).all(since);
    const outcomes = this.db.prepare(`SELECT outcome, COUNT(*) AS total FROM activities WHERE started_at>=?
      GROUP BY outcome ORDER BY total DESC`).all(since);
    const startedAt = this.db.prepare("SELECT value FROM metadata WHERE key='collection_started_at'").get()?.value;
    const load = this.db.prepare(`SELECT COUNT(*) AS measured,
      COALESCE(SUM(tracker_requests),0) AS requests, COALESCE(SUM(tracker_429),0) AS rate_limited,
      COALESCE(SUM(tracker_timeouts),0) AS timeouts, COALESCE(SUM(queue_wait_ms),0) AS queue_ms,
      COALESCE(SUM(tracker_duration_ms),0) AS http_ms,
      COALESCE(SUM(data_source='cache'),0) AS cache_hits, COALESCE(SUM(data_source='shared'),0) AS shared_hits
      FROM activities WHERE started_at>=? AND metrics_recorded=1`).get(since)!;
    return { totals, latency, scenarios, outcomes, startedAt, load, retentionDays: this.retentionDays };
  }

  users(since: string, search = '', page = 1) {
    // instr is a literal search: user-provided SQL wildcards do not change meaning.
    const params = [since, search.slice(0, 200)];
    const base = `FROM users u JOIN activities a ON a.user_key=u.user_key
      WHERE a.started_at>=? AND instr(lower(u.login),lower(?))>0`;
    const total = Number(this.db.prepare(`SELECT COUNT(DISTINCT u.user_key) AS n ${base}`).get(...params)?.n || 0);
    const rows = this.db.prepare(`SELECT u.user_key,u.login,u.first_seen,u.last_seen,COUNT(*) AS total,
      SUM(a.outcome IN ${ERROR_SQL}) AS errors ${base} GROUP BY u.user_key ORDER BY u.last_seen DESC
      LIMIT ? OFFSET ?`).all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    return { rows, total };
  }

  activities(filter: ActivityFilter) {
    const clauses = ['a.started_at>=?'];
    const params: string[] = [filter.since];
    for (const [column, value] of [
      ['a.user_key', filter.user], ['a.scenario', filter.scenario],
      ['a.outcome', filter.outcome], ['a.request_id', filter.requestId]
    ]) if (value) { clauses.push(`${column}=?`); params.push(value); }
    const base = `FROM activities a JOIN users u ON u.user_key=a.user_key WHERE ${clauses.join(' AND ')}`;
    const total = Number(this.db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...params)?.n || 0);
    const rows = this.db.prepare(`SELECT a.*,u.login ${base} ORDER BY a.started_at DESC, a.request_id DESC LIMIT ? OFFSET ?`)
      .all(...params, PAGE_SIZE, ((filter.page || 1) - 1) * PAGE_SIZE);
    return { rows, total };
  }

  backup(path: string) {
    // VACUUM INTO makes a consistent snapshot including committed WAL data. Target must not exist.
    this.db.prepare('VACUUM INTO ?').run(resolve(path));
  }
  close() { this.db.close(); }
}
