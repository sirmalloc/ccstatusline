import fs from 'fs';
import os from 'os';
import path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export const DEFAULT_REMOTE_NAME = 'dropbox';
export const CACHE_TTL_MS = 15_000;
const TAIL_BYTES = 64 * 1024;
const TO_UPLOAD_RE = /to upload (\d+)/;

interface QueueCacheEntry {
    value: number | null;
    createdAt: number;
}

const queueCache = new Map<string, QueueCacheEntry>();

export function getRcloneLogPath(remoteName: string): string {
    return path.join(os.homedir(), '.cache', 'rclone', `${remoteName}.log`);
}

export function readLogTail(logPath: string, maxBytes: number = TAIL_BYTES): string | null {
    let fd: number;
    try {
        fd = fs.openSync(logPath, 'r');
    } catch {
        return null;
    }

    try {
        const size = fs.fstatSync(fd).size;
        const readSize = Math.min(size, maxBytes);
        const start = size - readSize;
        const buffer = Buffer.alloc(readSize);
        if (readSize > 0) {
            fs.readSync(fd, buffer, 0, readSize, start);
        }

        let text = buffer.toString('utf8');
        if (start > 0) {
            // The window may start mid-line; discard that partial first line.
            const firstNewline = text.indexOf('\n');
            text = firstNewline === -1 ? '' : text.slice(firstNewline + 1);
        }

        return text;
    } finally {
        fs.closeSync(fd);
    }
}

export function parseQueueLength(logText: string): number | null {
    const lines = logText.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (!line) {
            continue;
        }

        const match = TO_UPLOAD_RE.exec(line);
        const raw = match?.[1];
        if (raw !== undefined) {
            return parseInt(raw, 10);
        }
    }

    return null;
}

export function getQueueLength(remoteName: string, now: number = Date.now()): number | null {
    const cached = queueCache.get(remoteName);
    if (cached && now - cached.createdAt < CACHE_TTL_MS) {
        return cached.value;
    }

    const logPath = getRcloneLogPath(remoteName);
    const text = readLogTail(logPath);
    const value = text === null ? null : parseQueueLength(text);
    queueCache.set(remoteName, { value, createdAt: now });
    return value;
}

export function clearRCloneQueueCache(): void {
    queueCache.clear();
}

export function getRemoteName(item: WidgetItem): string {
    return item.metadata?.remoteName ?? DEFAULT_REMOTE_NAME;
}

export class RCloneQueueWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the pending upload queue length for an rclone VFS mount (e.g. Dropbox)'; }
    getDisplayName(): string { return 'RClone Queue'; }
    getCategory(): string { return 'Environment'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: `${this.getDisplayName()} (${getRemoteName(item)})` };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '385' : 'RClone: 385';
        }

        const remoteName = getRemoteName(item);
        const queueLength = getQueueLength(remoteName);

        if (queueLength === null) {
            return item.rawValue ? 'n/a' : 'RClone: n/a';
        }

        return item.rawValue ? `${queueLength}` : `RClone: ${queueLength}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
