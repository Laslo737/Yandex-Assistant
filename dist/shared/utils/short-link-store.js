"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shortLinkStore = exports.ShortLinkStore = void 0;
exports.buildShortRedirectUrl = buildShortRedirectUrl;
const node_crypto_1 = require("node:crypto");
const node_sqlite_1 = require("node:sqlite");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const env_1 = require("../../config/env");
/** Redirects contain filters only, never Tracker task bodies. Tokens survive application restarts. */
class ShortLinkStore {
    db;
    constructor(path) {
        if (path !== ':memory:')
            (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)((0, node_path_1.resolve)(path)), { recursive: true, mode: 0o700 });
        this.db = new node_sqlite_1.DatabaseSync(path);
        const version = this.db.prepare('PRAGMA user_version').get()?.user_version;
        const unrelated = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name IN ('activities','recipients')").get();
        if ((version !== 0 && version !== 1) || unrelated) {
            this.db.close();
            throw new Error('UNKNOWN_SHORT_LINKS_SCHEMA');
        }
        this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
      CREATE TABLE IF NOT EXISTS short_links (token TEXT PRIMARY KEY,url TEXT NOT NULL UNIQUE);
      PRAGMA user_version=1;`);
    }
    remember(url) {
        const existing = this.db.prepare('SELECT token FROM short_links WHERE url=?').get(url)?.token;
        if (existing)
            return String(existing);
        // 128 random bits. Redirects are public but the target Tracker still enforces its own ACL.
        const token = (0, node_crypto_1.randomBytes)(16).toString('base64url');
        this.db.prepare('INSERT OR IGNORE INTO short_links VALUES (?,?)').run(token, url);
        return String(this.db.prepare('SELECT token FROM short_links WHERE url=?').get(url).token);
    }
    resolve(token) {
        return this.db.prepare('SELECT url FROM short_links WHERE token=?').get(token)?.url;
    }
    close() { this.db.close(); }
}
exports.ShortLinkStore = ShortLinkStore;
// Lazy opening keeps offline startup independent of writable storage when no links are requested.
let persistent;
function store() { return persistent ||= new ShortLinkStore(env_1.env.app.shortLinksDatabasePath); }
exports.shortLinkStore = {
    remember: (url) => store().remember(url),
    resolve: (token) => store().resolve(token)
};
function buildShortRedirectUrl(targetUrl) {
    const baseUrl = env_1.env.app.publicBaseUrl.replace(/\/+$/, '');
    const token = exports.shortLinkStore.remember(targetUrl);
    return `${baseUrl}/r/${token}`;
}
