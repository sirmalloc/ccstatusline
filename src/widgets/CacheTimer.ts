import * as fs from 'fs';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const TTL_SECONDS = 300;
const SAFETY_MARGIN = 5; // display as COLD 5s before actual expiry

/**
 * Read the last N bytes of a file and return as string.
 * Avoids loading large transcript files entirely.
 */
function readFileTail(filePath: string, bytes: number = 32768): string {
    try {
        const fd = fs.openSync(filePath, 'r');
        const stat = fs.fstatSync(fd);
        const size = stat.size;
        const readSize = Math.min(bytes, size);
        const offset = size - readSize;
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, offset);
        fs.closeSync(fd);
        return buf.toString('utf-8');
    } catch {
        return '';
    }
}

/**
 * Find the timestamp of the last assistant message in the transcript.
 * Returns null if not found.
 */
function getLastAssistantTimestamp(transcriptPath: string): Date | null {
    const tail = readFileTail(transcriptPath);
    if (!tail) return null;

    const lines = tail.split('\n').reverse();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const entry = JSON.parse(trimmed);
            if (entry.type === 'assistant' && entry.timestamp) {
                return new Date(entry.timestamp);
            }
        } catch {
            continue;
        }
    }
    return null;
}

function getRemainingSeconds(lastAssistant: Date): number {
    const elapsedSeconds = (Date.now() - lastAssistant.getTime()) / 1000;
    return TTL_SECONDS - SAFETY_MARGIN - elapsedSeconds;
}

function formatCountdown(remaining: number): string {
    if (remaining <= 0) return 'COLD';
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function getIcon(remaining: number): string {
    if (remaining <= 0) return '❄️';
    const pct = remaining / (TTL_SECONDS - SAFETY_MARGIN);
    if (pct > 0.5) return '🟢';
    if (pct > 0.2) return '🟡';
    return '🔴';
}

export class CacheTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightCyan'; }
    getDescription(): string { return 'Shows time remaining on the 5-minute prompt cache TTL'; }
    getDisplayName(): string { return 'Cache Timer'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cache: ', '🟢 4:52');
        }

        const transcriptPath = context.data?.transcript_path;
        if (!transcriptPath) return null;

        const lastAssistant = getLastAssistantTimestamp(transcriptPath);
        if (!lastAssistant) return null;

        const remaining = getRemainingSeconds(lastAssistant);
        const icon = getIcon(remaining);
        const countdown = formatCountdown(remaining);

        return formatRawOrLabeledValue(item, 'Cache: ', `${icon} ${countdown}`);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
