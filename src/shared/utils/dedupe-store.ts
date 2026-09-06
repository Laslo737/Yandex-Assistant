export class DedupeStore {
  constructor(private readonly ttlMs = 10 * 60 * 1000) {}

  private readonly items = new Map<string, number>();

  has(key: string): boolean {
    this.cleanup();
    const expiresAt = this.items.get(key);
    return Boolean(expiresAt && expiresAt > Date.now());
  }

  remember(key: string): void {
    this.cleanup();
    this.items.set(key, Date.now() + this.ttlMs);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.items.entries()) {
      if (expiresAt <= now) this.items.delete(key);
    }
  }
}
