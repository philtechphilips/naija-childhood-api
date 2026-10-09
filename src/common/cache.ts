/**
 * Tiny in-process TTL cache for hot read endpoints (leaderboards, config).
 * Concurrent misses for the same key share one in-flight load.
 */
export class TtlCache {
  private readonly store = new Map<string, { at: number; value: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  constructor(private readonly ttlMs: number, private readonly max = 500) {}

  async get<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.store.get(key);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value as T;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const p = load()
      .then((value) => {
        if (this.store.size >= this.max) this.store.delete(this.store.keys().next().value as string);
        this.store.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  invalidate(prefix = "") {
    for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
  }
}
