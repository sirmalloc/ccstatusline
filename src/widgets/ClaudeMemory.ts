import * as fs from 'fs';
import * as path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const MEMORY_INDEX_FILE = 'MEMORY.md';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

interface MemoryStats {
    count: number;
    newestMtimeMs: number;
}

function getMemoryStats(context: RenderContext): MemoryStats | null {
    const transcriptPath = context.data?.transcript_path;
    if (!transcriptPath) {
        return null;
    }

    try {
        const memoryDir = path.join(path.dirname(transcriptPath), 'memory');
        let count = 0;
        let newestMtimeMs = 0;

        for (const name of fs.readdirSync(memoryDir)) {
            if (!name.toLowerCase().endsWith('.md')) {
                continue;
            }

            const stats = fs.statSync(path.join(memoryDir, name));
            if (!stats.isFile()) {
                continue;
            }

            if (name !== MEMORY_INDEX_FILE) {
                count++;
            }
            newestMtimeMs = Math.max(newestMtimeMs, stats.mtimeMs);
        }

        if (count === 0) {
            return null;
        }

        return { count, newestMtimeMs };
    } catch {
        return null;
    }
}

function formatAge(ageMs: number): string {
    if (ageMs < MINUTE_MS)
        return '<1m';
    if (ageMs < HOUR_MS)
        return `${Math.floor(ageMs / MINUTE_MS)}m`;
    if (ageMs < DAY_MS)
        return `${Math.floor(ageMs / HOUR_MS)}h`;
    return `${Math.floor(ageMs / DAY_MS)}d`;
}

export class ClaudeMemoryWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the number of Claude memory files for this project and how recently they were updated'; }
    getDisplayName(): string { return 'Claude Memory'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '3 (5m)' : '🧠 3 (5m)';
        }

        const stats = getMemoryStats(context);
        if (!stats) {
            return null;
        }

        const value = `${stats.count} (${formatAge(Date.now() - stats.newestMtimeMs)})`;
        return item.rawValue ? value : `🧠 ${value}`;
    }

    getNumericValue(context: RenderContext, item: WidgetItem): number | null {
        return getMemoryStats(context)?.count ?? null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
