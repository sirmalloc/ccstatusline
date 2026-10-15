// Shared provider-refresh machinery for the daemon (#18): a bounded Map cap
// and a single-flight group. The group keys in-flight provider work (a git
// spawn, a usage fetch, a review lookup) so concurrent renders that need the
// same data join one execution, and the underlying subprocess/HTTP work is
// aborted only when the last consumer goes away — one session disconnecting
// must never kill a refresh another session is still waiting on.

/** Truncate a Map to the newest `maxEntries` insertions (FIFO eviction). */
export function capMap<K, V>(map: Map<K, V>, maxEntries: number): void {
    while (map.size > maxEntries) {
        const oldest = map.keys().next();
        if (oldest.done) {
            return;
        }
        map.delete(oldest.value);
    }
}

interface RefreshJob {
    controller: AbortController;
    consumers: number;
    promise: Promise<unknown>;
}

export class RefreshGroup {
    private readonly jobs = new Map<string, RefreshJob>();

    /**
     * Run `work` once per key while consumers remain. Every caller gets a
     * release function; when the last consumer releases before completion the
     * job's signal fires and the work is expected to settle on its own. A
     * caller releasing after completion is a no-op. Joining an already
     * cancelled job starts a fresh one.
     */
    refresh<T>(key: string, work: (signal: AbortSignal) => Promise<T>): { promise: Promise<T>; release: () => void } {
        const existing = this.jobs.get(key);
        if (existing && !existing.controller.signal.aborted) {
            existing.consumers++;
            return {
                promise: existing.promise as Promise<T>,
                release: () => { this.release(key, existing); }
            };
        }

        const controller = new AbortController();
        const job: RefreshJob = {
            controller,
            consumers: 1,
            // Only unregister while still owning the key: a cancelled job can
            // settle after a fresh job already replaced it (#18 review).
            promise: work(controller.signal).finally(() => {
                if (this.jobs.get(key) === job) {
                    this.jobs.delete(key);
                }
            })
        };
        this.jobs.set(key, job);
        return {
            promise: job.promise as Promise<T>,
            release: () => { this.release(key, job); }
        };
    }

    private release(key: string, job: RefreshJob): void {
        if (job.consumers > 0) {
            job.consumers--;
        }
        if (job.consumers === 0 && this.jobs.get(key) === job) {
            job.controller.abort();
        }
    }

    /** In-flight job count; diagnostics and tests only. */
    get size(): number {
        return this.jobs.size;
    }
}
