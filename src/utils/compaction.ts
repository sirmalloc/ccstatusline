import * as fs from 'fs';

import type { CompactionData } from '../types/RenderContext';

import {
    parseJsonlLine,
    readJsonlLines
} from './jsonl-lines';

/** Shared zeroed stats for missing/unreadable transcripts and as a render fallback. Treat as read-only. */
export const ZERO_COMPACTION_STATS: CompactionData = {
    count: 0,
    byTrigger: { auto: 0, manual: 0, unknown: 0 },
    tokensReclaimed: 0
};

function isCompactBoundary(record: unknown): boolean {
    if (typeof record !== 'object' || record === null) {
        return false;
    }
    const r = record as { type?: unknown; subtype?: unknown; isSidechain?: unknown };
    return r.type === 'system' && r.subtype === 'compact_boundary' && r.isSidechain !== true;
}

/**
 * Count context-compaction events and summarize their `compactMetadata` by
 * scanning the transcript for `{type:'system', subtype:'compact_boundary'}`
 * markers Claude Code writes on every compaction. Exact and immune to transient
 * context-percentage noise. Sidechain (subagent) records are excluded.
 *
 * `trigger` missing or unrecognized is counted under `unknown` (never guessed).
 * `tokensReclaimed` sums `preTokens - postTokens` only for markers where both
 * are finite numbers; older markers without `postTokens` contribute 0.
 */
export function computeCompactionStats(lines: string[]): CompactionData {
    const stats: CompactionData = {
        count: 0,
        byTrigger: { auto: 0, manual: 0, unknown: 0 },
        tokensReclaimed: 0
    };
    for (const line of lines) {
        const record = parseJsonlLine(line);
        if (!isCompactBoundary(record)) {
            continue;
        }
        stats.count += 1;

        const meta = (record as { compactMetadata?: unknown }).compactMetadata;
        const metaObj = (typeof meta === 'object' && meta !== null) ? meta as Record<string, unknown> : null;

        const trigger = metaObj?.trigger;
        if (trigger === 'auto') {
            stats.byTrigger.auto += 1;
        } else if (trigger === 'manual') {
            stats.byTrigger.manual += 1;
        } else {
            stats.byTrigger.unknown += 1;
        }

        const pre = metaObj?.preTokens;
        const post = metaObj?.postTokens;
        if (typeof pre === 'number' && Number.isFinite(pre) && typeof post === 'number' && Number.isFinite(post)) {
            stats.tokensReclaimed += pre - post;
        }
    }
    return stats;
}

/** Best-effort: returns zeroed stats when the transcript is missing or unreadable. */
export async function getCompactionStats(transcriptPath: string): Promise<CompactionData> {
    try {
        if (!fs.existsSync(transcriptPath)) {
            return ZERO_COMPACTION_STATS;
        }
        const lines = await readJsonlLines(transcriptPath);
        return computeCompactionStats(lines);
    } catch {
        return ZERO_COMPACTION_STATS;
    }
}
