import fs from 'fs';
import {
    Box,
    Text,
    useInput
} from 'ink';
import os from 'os';
import path from 'path';
import React, { useState } from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { shouldInsertInput } from '../utils/input-guards';

export const DEFAULT_REMOTE_NAME = 'dropbox';
export const CACHE_TTL_MS = 15_000;
export const EDIT_REMOTE_ACTION = 'edit-remote';
const TAIL_BYTES = 64 * 1024;
const TO_UPLOAD_RE = /to upload (\d+)/;

interface QueueCacheEntry {
    value: number | null;
    createdAt: number;
}

const QUEUE_CACHE_SCHEMA_VERSION = 1 as const;

interface PersistentQueueCache {
    version: typeof QUEUE_CACHE_SCHEMA_VERSION;
    entries: Record<string, QueueCacheEntry>;
}

const queueCache = new Map<string, QueueCacheEntry>();

function getPersistentCachePath(): string {
    return path.join(os.homedir(), '.cache', 'ccstatusline', 'rclone-queue-cache.json');
}

function isQueueCacheEntry(value: unknown): value is QueueCacheEntry {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const entry = value as Record<string, unknown>;
    return (typeof entry.value === 'number' || entry.value === null) && typeof entry.createdAt === 'number';
}

function readPersistentQueueCache(): PersistentQueueCache | null {
    try {
        const parsed = JSON.parse(fs.readFileSync(getPersistentCachePath(), 'utf-8')) as unknown;
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }

        const data = parsed as { version?: unknown; entries?: unknown };
        if (data.version !== QUEUE_CACHE_SCHEMA_VERSION || typeof data.entries !== 'object' || data.entries === null) {
            return null;
        }

        const entries: Record<string, QueueCacheEntry> = {};
        for (const [key, value] of Object.entries(data.entries)) {
            if (isQueueCacheEntry(value)) {
                entries[key] = value;
            }
        }

        return { version: QUEUE_CACHE_SCHEMA_VERSION, entries };
    } catch {
        return null;
    }
}

function writePersistentQueueCache(cache: PersistentQueueCache): void {
    try {
        const cachePath = getPersistentCachePath();
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(cache), 'utf-8');
        fs.renameSync(tempPath, cachePath);
    } catch {
        // Best-effort cache; statusline rendering should never fail because of it.
    }
}

export function getRcloneLogPath(remoteName: string): string {
    // path.basename strips any directory separators (including "../" traversal
    // segments), so a remoteName sourced from freely-typed metadata can never
    // resolve outside ~/.cache/rclone/.
    return path.join(os.homedir(), '.cache', 'rclone', `${path.basename(remoteName)}.log`);
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
        let bytesRead = 0;
        if (readSize > 0) {
            bytesRead = fs.readSync(fd, buffer, 0, readSize, start);
        }

        let text = buffer.subarray(0, bytesRead).toString('utf8');
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

    // ccstatusline's primary (piped) mode runs as a fresh process per statusline
    // refresh, so the in-process cache above is empty on every invocation. Fall
    // back to a persistent on-disk cache (same TTL) so the 64KB tail-read+regex
    // work is actually skipped across refreshes, not just within one process.
    const persistentCache = readPersistentQueueCache();
    const persistentEntry = persistentCache?.entries[remoteName];
    if (persistentEntry && now - persistentEntry.createdAt < CACHE_TTL_MS) {
        queueCache.set(remoteName, persistentEntry);
        return persistentEntry.value;
    }

    const logPath = getRcloneLogPath(remoteName);
    const text = readLogTail(logPath);
    const value = text === null ? null : parseQueueLength(text);
    const entry: QueueCacheEntry = { value, createdAt: now };
    queueCache.set(remoteName, entry);

    const cache = persistentCache ?? { version: QUEUE_CACHE_SCHEMA_VERSION, entries: {} };
    cache.entries[remoteName] = entry;
    writePersistentQueueCache(cache);

    return value;
}

export function clearRCloneQueueCache(): void {
    queueCache.clear();
    try {
        fs.rmSync(getPersistentCachePath(), { force: true });
    } catch {
        // Best-effort cleanup; only used by tests to avoid cross-run pollution.
    }
}

export function getRemoteName(item: WidgetItem): string {
    const remoteName = item.metadata?.remoteName?.trim();
    return remoteName && remoteName.length > 0 ? remoteName : DEFAULT_REMOTE_NAME;
}

export class RCloneQueueWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the pending upload queue length for an rclone VFS mount (e.g. Dropbox)'; }
    getDisplayName(): string { return 'RClone Queue'; }
    getCategory(): string { return 'Environment'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: `${this.getDisplayName()} (${getRemoteName(item)})` };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{ key: 'e', label: '(e)dit remote', action: EDIT_REMOTE_ACTION }];
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

    renderEditor(props: WidgetEditorProps): React.ReactElement {
        return <RCloneRemoteEditor {...props} />;
    }
}

const RCloneRemoteEditor: React.FC<WidgetEditorProps> = ({ widget, onComplete, onCancel }) => {
    const [text, setText] = useState(getRemoteName(widget));
    const [cursorPos, setCursorPos] = useState(text.length);

    useInput((input, key) => {
        if (key.return) {
            const trimmed = text.trim();
            onComplete({
                ...widget,
                metadata: { ...(widget.metadata ?? {}), remoteName: trimmed.length > 0 ? trimmed : DEFAULT_REMOTE_NAME }
            });
        } else if (key.escape) {
            onCancel();
        } else if (key.leftArrow) {
            setCursorPos(pos => Math.max(0, pos - 1));
        } else if (key.rightArrow) {
            setCursorPos(pos => Math.min(text.length, pos + 1));
        } else if (key.backspace) {
            setCursorPos((pos) => {
                if (pos > 0) {
                    setText(t => t.slice(0, pos - 1) + t.slice(pos));
                    return pos - 1;
                }
                return pos;
            });
        } else if (key.delete) {
            setText((t) => {
                if (cursorPos < t.length) {
                    return t.slice(0, cursorPos) + t.slice(cursorPos + 1);
                }
                return t;
            });
        } else if (shouldInsertInput(input, key)) {
            setText(t => t.slice(0, cursorPos) + input + t.slice(cursorPos));
            setCursorPos(pos => pos + input.length);
        }
    });

    let display = 'Enter rclone remote name: ';
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char !== undefined) {
            display += i === cursorPos ? `\x1b[7m${char}\x1b[0m` : char;
        }
    }
    if (cursorPos >= text.length) {
        display += '\x1b[7m \x1b[0m';
    }

    return (
        <Box flexDirection='column'>
            <Text>{display}</Text>
            <Text dimColor>←→ move cursor, Enter save, ESC cancel (default: dropbox)</Text>
        </Box>
    );
};
