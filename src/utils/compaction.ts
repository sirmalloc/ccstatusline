import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
 * filters rounding noise and cache accounting wobble — a drop must exceed
 * the threshold (default: more than 2 points) to count.
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
    const home = process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
    return path.join(home, '.cache', 'ccstatusline', CACHE_SUBDIR);
}

function sanitizeSessionId(sessionId: string): string {
    return sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function getStatePath(sessionId: string): string {
    return path.join(getCacheDir(), `compaction-${sanitizeSessionId(sessionId)}.json`);
}

/**
 * Load compaction state for a session.
 */
export function loadCompactionState(sessionId: string): CompactionState {
    const statePath = getStatePath(sessionId);
    if (!fs.existsSync(statePath)) {
        return { count: 0, prevCtxPct: 0 };
    }
    try {
        const raw: unknown = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        const result = CompactionStateSchema.safeParse(raw);
        return result.success ? result.data : { count: 0, prevCtxPct: 0 };
    } catch {
        return { count: 0, prevCtxPct: 0 };
    }
}

/**
 * Save compaction state for a session.
 */
export function saveCompactionState(sessionId: string, state: CompactionState): void {
    try {
        const dir = getCacheDir();
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(getStatePath(sessionId), JSON.stringify(state) + '\n');
    } catch {
        // Best-effort — cache write failure should not break status line rendering
    }
}
