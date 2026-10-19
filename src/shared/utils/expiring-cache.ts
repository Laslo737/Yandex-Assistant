export type CacheSource = 'fresh' | 'cache' | 'shared';
export class CacheBusyError extends Error {}

/** Bounded TTL/LRU cache + single flight. No rejected promises or expired values are served. */
export class ExpiringCache<T> {
  private readonly values = new Map<string, { expiresAt: number; value: T }>();
  private readonly pending = new Map<string, Promise<T>>();
  constructor(private readonly ttlMs: number, private readonly maxEntries: number,
    private readonly maxPending: number, private readonly now = () => performance.now()) {
    if (![ttlMs, maxEntries, maxPending].every(Number.isInteger) || ttlMs < 0 || maxEntries < 1 || maxPending < 1) {
      throw new Error('Invalid cache configuration');
    }
  }
  async get(key: string, load: () => Promise<T>, observe: (source: CacheSource) => void = () => {}): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.values.delete(key); this.values.set(key, cached); observe('cache'); return cached.value;
    }
    if (cached) this.values.delete(key);
    const existing = this.pending.get(key);
    if (existing) { observe('shared'); return existing; }
    if (this.pending.size >= this.maxPending) throw new CacheBusyError('CACHE_BUSY');
    observe('fresh');
    const promise = Promise.resolve().then(load).then((value) => {
      const now = this.now();
      for (const [entryKey, entry] of this.values) if (entry.expiresAt <= now) this.values.delete(entryKey);
      if (this.ttlMs > 0) {
        this.values.set(key, { expiresAt: now + this.ttlMs, value });
        while (this.values.size > this.maxEntries) this.values.delete(this.values.keys().next().value!);
      }
      return value;
    }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, promise);
    return promise;
  }
}
