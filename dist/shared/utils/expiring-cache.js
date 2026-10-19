"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpiringCache = exports.CacheBusyError = void 0;
class CacheBusyError extends Error {
}
exports.CacheBusyError = CacheBusyError;
/** Bounded TTL/LRU cache + single flight. No rejected promises or expired values are served. */
class ExpiringCache {
    ttlMs;
    maxEntries;
    maxPending;
    now;
    values = new Map();
    pending = new Map();
    constructor(ttlMs, maxEntries, maxPending, now = () => performance.now()) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
        this.maxPending = maxPending;
        this.now = now;
        if (![ttlMs, maxEntries, maxPending].every(Number.isInteger) || ttlMs < 0 || maxEntries < 1 || maxPending < 1) {
            throw new Error('Invalid cache configuration');
        }
    }
    async get(key, load, observe = () => { }) {
        const cached = this.values.get(key);
        if (cached && cached.expiresAt > this.now()) {
            this.values.delete(key);
            this.values.set(key, cached);
            observe('cache');
            return cached.value;
        }
        if (cached)
            this.values.delete(key);
        const existing = this.pending.get(key);
        if (existing) {
            observe('shared');
            return existing;
        }
        if (this.pending.size >= this.maxPending)
            throw new CacheBusyError('CACHE_BUSY');
        observe('fresh');
        const promise = Promise.resolve().then(load).then((value) => {
            const now = this.now();
            for (const [entryKey, entry] of this.values)
                if (entry.expiresAt <= now)
                    this.values.delete(entryKey);
            if (this.ttlMs > 0) {
                this.values.set(key, { expiresAt: now + this.ttlMs, value });
                while (this.values.size > this.maxEntries)
                    this.values.delete(this.values.keys().next().value);
            }
            return value;
        }).finally(() => { this.pending.delete(key); });
        this.pending.set(key, promise);
        return promise;
    }
}
exports.ExpiringCache = ExpiringCache;
