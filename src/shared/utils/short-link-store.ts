import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from '../../config/env';

/** Redirects contain filters only, never Tracker task bodies. Tokens survive application restarts. */
export class ShortLinkStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version;
    const unrelated = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('activities','recipients')").get();
    if ((version !== 0 && version !== 1) || unrelated) { this.db.close(); throw new Error('UNKNOWN_SHORT_LINKS_SCHEMA'); }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS short_links (token TEXT PRIMARY KEY,url TEXT NOT NULL UNIQUE);
      PRAGMA user_version=1;`);
  }
  remember(url: string): string {
    const existing = this.db.prepare('SELECT token FROM short_links WHERE url=?').get(url)?.token;
    if (existing) return String(existing);
    // 128 random bits. Redirects are public but the target Tracker still enforces its own ACL.
    const token = randomBytes(16).toString('base64url');
    this.db.prepare('INSERT OR IGNORE INTO short_links VALUES (?,?)').run(token, url);
    return String(this.db.prepare('SELECT token FROM short_links WHERE url=?').get(url)!.token);
  }
  resolve(token: string): string | undefined {
    return this.db.prepare('SELECT url FROM short_links WHERE token=?').get(token)?.url as string | undefined;
  }
  close() { this.db.close(); }
}

// Lazy opening keeps offline startup independent of writable storage when no links are requested.
let persistent: ShortLinkStore | undefined;
function store() { return persistent ||= new ShortLinkStore(env.app.shortLinksDatabasePath); }
export const shortLinkStore = {
  remember: (url: string) => store().remember(url),
  resolve: (token: string) => store().resolve(token)
};
export function buildShortRedirectUrl(targetUrl: string): string {
  const baseUrl = env.app.publicBaseUrl.replace(/\/+$/, '');
  const token = shortLinkStore.remember(targetUrl);
  return `${baseUrl}/r/${token}`;
}
