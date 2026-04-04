import {
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

const DEFAULT_DROP_THRESHOLD = 2;
const CACHE_SUBDIR = 'compaction';

export interface CompactionState {
    count: number;
    prevCtxPct: number;
}

const CompactionStateSchema = z.object({
    count: z.number().default(0),
    prevCtxPct: z.number().default(0)
});

/**
 * Detect context compaction events.
 *
 * Context only grows until compaction — any drop in used_percentage beyond
 * the threshold indicates Claude Code compacted the conversation. The threshold
 * filters rounding noise and cache accounting wobble (±1 point).
 *
 * @param currentCtxPct - Current used_percentage from StatusJSON
 * @param state - Previous compaction state
 * @param dropThreshold - Minimum percentage-point drop to count as compaction (default: 2)
 * @returns Updated compaction state
 */
export function detectCompaction(
    currentCtxPct: number,
    state: CompactionState,
    dropThreshold: number = DEFAULT_DROP_THRESHOLD
): CompactionState {
    let { count } = state;
    const { prevCtxPct } = state;

    if (prevCtxPct > 0 && currentCtxPct < prevCtxPct - dropThreshold) {
        count += 1;
    }

    return { count, prevCtxPct: currentCtxPct };
}

function getCacheDir(): string {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    return join(home, '.cache', 'ccstatusline', CACHE_SUBDIR);
}

function getStatePath(sessionId: string): string {
    return join(getCacheDir(), `compaction-${sessionId}.json`);
}

/**
 * Load compaction state for a session.
 */
export function loadCompactionState(sessionId: string): CompactionState {
    const path = getStatePath(sessionId);
    if (!existsSync(path)) {
        return { count: 0, prevCtxPct: 0 };
    }
    try {
        const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'));
        return CompactionStateSchema.parse(raw);
    } catch {
        return { count: 0, prevCtxPct: 0 };
    }
}

/**
 * Save compaction state for a session.
 */
export function saveCompactionState(sessionId: string, state: CompactionState): void {
    const dir = getCacheDir();
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(getStatePath(sessionId), JSON.stringify(state) + '\n');
}