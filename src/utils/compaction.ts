import * as fs from 'fs';

import {
    parseJsonlLine,
    readJsonlLines
} from './jsonl-lines';

function isCompactBoundary(record: unknown): boolean {
    if (typeof record !== 'object' || record === null) {
        return false;
    }
    const r = record as { type?: unknown; subtype?: unknown; isSidechain?: unknown };
    return r.type === 'system' && r.subtype === 'compact_boundary' && r.isSidechain !== true;
}

/**
 * Count context-compaction events by scanning the transcript for the
 * `{type:'system', subtype:'compact_boundary'}` markers Claude Code writes on
 * every compaction. Exact and immune to transient context-percentage noise.
 * Sidechain (subagent) records are excluded — only main-chain compactions count.
 */
export function countCompactionsInLines(lines: string[]): number {
    let count = 0;
    for (const line of lines) {
        if (isCompactBoundary(parseJsonlLine(line))) {
            count += 1;
        }
    }
    return count;
}

/** Best-effort: returns 0 when the transcript is missing or unreadable. */
export async function getCompactionCount(transcriptPath: string): Promise<number> {
    try {
        if (!fs.existsSync(transcriptPath)) {
            return 0;
        }
        const lines = await readJsonlLines(transcriptPath);
        return countCompactionsInLines(lines);
    } catch {
        return 0;
    }
}
