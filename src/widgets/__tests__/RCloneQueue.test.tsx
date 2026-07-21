import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import {
    CACHE_TTL_MS,
    DEFAULT_REMOTE_NAME,
    RCloneQueueWidget,
    clearRCloneQueueCache,
    getQueueLength,
    getRcloneLogPath,
    getRemoteName,
    parseQueueLength,
    readLogTail
} from '../RCloneQueue';

describe('parseQueueLength', () => {
    it('extracts the queue length from a normal vfs cache stats line', () => {
        const log = `2026/07/21 19:16:46 INFO  : Dropbox root '': vfs cache: cleaned: objects 56315 (was 56315) in use 1381, to upload 1374, uploading 6, total size 45.479Gi (was 45.479Gi)\n`;
        expect(parseQueueLength(log)).toBe(1374);
    });

    it('picks the most recent matching line when there are several', () => {
        const log = [
            'INFO : vfs cache: cleaned: in use 100, to upload 90, uploading 2, total size 1Gi',
            'INFO : some unrelated line',
            'INFO : vfs cache: cleaned: in use 50, to upload 40, uploading 1, total size 1Gi'
        ].join('\n');
        expect(parseQueueLength(log)).toBe(40);
    });

    it('returns null when no line matches', () => {
        const log = 'INFO : Dropbox root \'\': Copied (new)\nINFO : some other unrelated line\n';
        expect(parseQueueLength(log)).toBeNull();
    });

    it('returns null for an empty string', () => {
        expect(parseQueueLength('')).toBeNull();
    });

    it('does not throw on a malformed/truncated line', () => {
        const log = 'garbage that mentions to upload but not a number: to upload abc\n';
        expect(parseQueueLength(log)).toBeNull();
    });
});

describe('readLogTail', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rclone-queue-widget-test-'));

    afterEach(() => {
        for (const file of fs.readdirSync(tmpDir)) {
            fs.unlinkSync(path.join(tmpDir, file));
        }
    });

    it('returns null when the file does not exist', () => {
        expect(readLogTail(path.join(tmpDir, 'does-not-exist.log'))).toBeNull();
    });

    it('returns the full content when the file is smaller than maxBytes', () => {
        const logPath = path.join(tmpDir, 'small.log');
        fs.writeFileSync(logPath, 'line one\nline two\n');
        expect(readLogTail(logPath, 1024)).toBe('line one\nline two\n');
    });

    it('discards a partial first line when the read window starts mid-file', () => {
        const logPath = path.join(tmpDir, 'large.log');
        // "AAAAA\n" (6 bytes) + "to upload 42\n" (13 bytes) = 19 bytes total.
        // With maxBytes=13, the read window starts at byte 6, landing exactly
        // on the second line's start (no partial line to discard in this case),
        // so use an offset that actually lands mid-line instead:
        fs.writeFileSync(logPath, 'AAAAA\nto upload 42\n');
        const content = fs.readFileSync(logPath, 'utf8');
        expect(content.length).toBe(19);
        // maxBytes=15 makes the window start at byte 4, which is inside "AAAAA"
        const tail = readLogTail(logPath, 15);
        expect(tail).not.toBeNull();
        expect(tail).not.toContain('AAA');
        expect(parseQueueLength(tail ?? '')).toBe(42);
    });
});

describe('getQueueLength (cache)', () => {
    const remoteName = 'test-remote';
    const logPath = getRcloneLogPath(remoteName);

    beforeEach(() => {
        clearRCloneQueueCache();
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
    });

    afterEach(() => {
        clearRCloneQueueCache();
        if (fs.existsSync(logPath)) {
            fs.rmSync(logPath);
        }
    });

    it('returns the default remote name constant', () => {
        expect(DEFAULT_REMOTE_NAME).toBe('dropbox');
    });

    it('reads a fresh value when nothing is cached yet', () => {
        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 7, uploading 1, total size 1Gi\n');
        expect(getQueueLength(remoteName, 1000)).toBe(7);
    });

    it('returns the cached value within the TTL window even if the file changes', () => {
        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 7, uploading 1, total size 1Gi\n');
        expect(getQueueLength(remoteName, 1000)).toBe(7);

        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 999, uploading 1, total size 1Gi\n');
        // Still within CACHE_TTL_MS (15000) of the first call.
        expect(getQueueLength(remoteName, 1000 + CACHE_TTL_MS - 1)).toBe(7);
    });

    it('re-reads the file once the TTL window has elapsed', () => {
        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 7, uploading 1, total size 1Gi\n');
        expect(getQueueLength(remoteName, 1000)).toBe(7);

        fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 999, uploading 1, total size 1Gi\n');
        expect(getQueueLength(remoteName, 1000 + CACHE_TTL_MS)).toBe(999);
    });

    it('returns null (and caches null) when the log file does not exist', () => {
        expect(getQueueLength(remoteName, 1000)).toBeNull();
    });

    it('derives the log path from ~/.cache/rclone/<remoteName>.log', () => {
        expect(getRcloneLogPath('gdrive')).toBe(path.join(os.homedir(), '.cache', 'rclone', 'gdrive.log'));
    });
});

describe('RCloneQueueWidget', () => {
    const remoteName = 'test-remote-widget';
    const logPath = getRcloneLogPath(remoteName);

    beforeEach(() => {
        clearRCloneQueueCache();
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
    });

    afterEach(() => {
        clearRCloneQueueCache();
        if (fs.existsSync(logPath)) {
            fs.rmSync(logPath);
        }
    });

    describe('metadata', () => {
        const widget = new RCloneQueueWidget();

        it('returns correct display name', () => {
            expect(widget.getDisplayName()).toBe('RClone Queue');
        });

        it('returns correct category', () => {
            expect(widget.getCategory()).toBe('Environment');
        });

        it('returns blue as default color', () => {
            expect(widget.getDefaultColor()).toBe('blue');
        });

        it('supports raw value', () => {
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('supports colors', () => {
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue' };
            expect(widget.supportsColors(item)).toBe(true);
        });

        it('shows the default remote name in the editor display when unset', () => {
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue' };
            expect(widget.getEditorDisplay(item).displayText).toBe('RClone Queue (dropbox)');
        });

        it('shows the configured remote name in the editor display', () => {
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName: 'gdrive' } };
            expect(widget.getEditorDisplay(item).displayText).toBe('RClone Queue (gdrive)');
        });
    });

    describe('preview mode', () => {
        const widget = new RCloneQueueWidget();

        it('returns labeled mock data', () => {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue' };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('RClone: 385');
        });

        it('returns bare mock data when rawValue is set', () => {
            const context: RenderContext = { isPreview: true };
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', rawValue: true };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('385');
        });
    });

    describe('render', () => {
        const widget = new RCloneQueueWidget();

        it('renders the queue length from the configured remote\'s log', () => {
            fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 12, uploading 1, total size 1Gi\n');
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName } };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('RClone: 12');
        });

        it('renders the bare number when rawValue is set', () => {
            fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 12, uploading 1, total size 1Gi\n');
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName }, rawValue: true };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('12');
        });

        it('renders "n/a" when the log file does not exist', () => {
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName } };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('RClone: n/a');
        });

        it('renders bare "n/a" when the log file does not exist and rawValue is set', () => {
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName }, rawValue: true };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('n/a');
        });

        it('renders 0 as a real value, not as n/a', () => {
            fs.writeFileSync(logPath, 'INFO : vfs cache: cleaned: in use 10, to upload 0, uploading 0, total size 1Gi\n');
            const context: RenderContext = {};
            const item: WidgetItem = { id: 'rc', type: 'rclone-queue', metadata: { remoteName } };
            expect(widget.render(item, context, DEFAULT_SETTINGS)).toBe('RClone: 0');
        });

        it('defaults to the dropbox remote when no metadata is set', () => {
            expect(getRemoteName({ id: 'rc', type: 'rclone-queue' })).toBe('dropbox');
        });

        it('uses the configured remote name from metadata', () => {
            expect(getRemoteName({ id: 'rc', type: 'rclone-queue', metadata: { remoteName: 'gdrive' } })).toBe('gdrive');
        });
    });
});
