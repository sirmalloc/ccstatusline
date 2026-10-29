import type { CompactionData } from '../types/RenderContext';

/** Shared zeroed stats for missing/unreadable transcripts and as a render fallback. Treat as read-only. */
export const ZERO_COMPACTION_STATS: CompactionData = Object.freeze({
    count: 0,
    byTrigger: Object.freeze({ auto: 0, manual: 0, unknown: 0 }),
    tokensReclaimed: 0
});

export function isCompactBoundary(record: unknown): boolean {
    if (typeof record !== 'object' || record === null) {
        return false;
    }
    const r = record as { type?: unknown; subtype?: unknown; isSidechain?: unknown };
    return r.type === 'system' && r.subtype === 'compact_boundary' && r.isSidechain !== true;
}

/**
 * Returns the post-compaction context size (`compactMetadata.postTokens`) for a
 * compact_boundary record, or null when the record is not a boundary or omits a
 * finite postTokens value (older Claude Code transcripts).
 */
export function getCompactBoundaryPostTokens(record: unknown): number | null {
    if (!isCompactBoundary(record)) {
        return null;
    }
    const meta = (record as { compactMetadata?: unknown }).compactMetadata;
    const post = (typeof meta === 'object' && meta !== null)
        ? (meta as Record<string, unknown>).postTokens
        : undefined;
    return typeof post === 'number' && Number.isFinite(post) ? Math.max(0, post) : null;
}

export function createCompactionStats(): CompactionData {
    return {
        count: 0,
        byTrigger: { auto: 0, manual: 0, unknown: 0 },
        tokensReclaimed: 0
    };
}

export function accumulateCompactionStats(stats: CompactionData, record: unknown): void {
    if (!isCompactBoundary(record)) {
        return;
    }

    stats.count += 1;
    const meta = (record as { compactMetadata?: unknown }).compactMetadata;
    const metaRecord = (typeof meta === 'object' && meta !== null) ? meta as Record<string, unknown> : null;

    const trigger = metaRecord?.trigger;
    if (trigger === 'auto') {
        stats.byTrigger.auto += 1;
    } else if (trigger === 'manual') {
        stats.byTrigger.manual += 1;
    } else {
        stats.byTrigger.unknown += 1;
    }

    const pre = metaRecord?.preTokens;
    const post = metaRecord?.postTokens;
    if (typeof pre === 'number' && typeof post === 'number') {
        const reclaimed = pre - post;
        if (Number.isFinite(reclaimed)) {
            stats.tokensReclaimed += Math.max(0, reclaimed);
        }
    }
}
