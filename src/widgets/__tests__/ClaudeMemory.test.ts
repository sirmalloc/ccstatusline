import * as fs from 'fs';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type {
    RenderContext,
    WidgetItem
} from '../../types';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { ClaudeMemoryWidget } from '../ClaudeMemory';

const NOW = 1_800_000_000_000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TRANSCRIPT_PATH = '/home/user/.claude/projects/-home-user-proj/session.jsonl';

function makeContext(overrides?: Partial<RenderContext>): RenderContext {
    return {
        data: { transcript_path: TRANSCRIPT_PATH },
        ...overrides
    };
}

function render(itemOverrides?: Partial<WidgetItem>, context?: RenderContext): string | null {
    const item: WidgetItem = { id: 'test', type: 'claude-memory', ...itemOverrides };
    return new ClaudeMemoryWidget().render(item, context ?? makeContext(), DEFAULT_SETTINGS);
}

interface FakeEntry {
    mtimeMs: number;
    isDirectory?: boolean;
}

function mockMemoryDir(files: Record<string, FakeEntry>): void {
    vi.spyOn(fs, 'readdirSync').mockImplementation(() => Object.keys(files) as unknown as ReturnType<typeof fs.readdirSync>);
    vi.spyOn(fs, 'statSync').mockImplementation((statPath: fs.PathLike) => {
        const name = String(statPath).split(/[\\/]/).pop() ?? '';
        const entry = files[name];
        if (!entry) {
            throw new Error('ENOENT');
        }

        return {
            isFile: () => !entry.isDirectory,
            mtimeMs: entry.mtimeMs
        } as fs.Stats;
    });
}

describe('ClaudeMemoryWidget', () => {
    beforeEach(() => {
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows memory file count excluding MEMORY.md and age of newest file', () => {
        mockMemoryDir({
            'MEMORY.md': { mtimeMs: NOW - 5 * MINUTE },
            'user-prefs.md': { mtimeMs: NOW - 2 * HOUR },
            'project-goal.md': { mtimeMs: NOW - 3 * HOUR }
        });

        expect(render()).toBe('🧠 2 (5m)');
    });

    it('reads the memory directory next to the transcript file', () => {
        mockMemoryDir({ 'a.md': { mtimeMs: NOW - MINUTE } });

        render();

        expect(fs.readdirSync).toHaveBeenCalledWith('/home/user/.claude/projects/-home-user-proj/memory');
    });

    it('supports raw value without the icon prefix', () => {
        mockMemoryDir({ 'a.md': { mtimeMs: NOW - 5 * MINUTE } });

        expect(render({ rawValue: true })).toBe('1 (5m)');
    });

    it('formats ages as <1m, minutes, hours, and days', () => {
        mockMemoryDir({ 'a.md': { mtimeMs: NOW - 30_000 } });
        expect(render()).toBe('🧠 1 (<1m)');

        mockMemoryDir({ 'a.md': { mtimeMs: NOW - 42 * MINUTE } });
        expect(render()).toBe('🧠 1 (42m)');

        mockMemoryDir({ 'a.md': { mtimeMs: NOW - 3 * HOUR - 20 * MINUTE } });
        expect(render()).toBe('🧠 1 (3h)');

        mockMemoryDir({ 'a.md': { mtimeMs: NOW - 2 * DAY - HOUR } });
        expect(render()).toBe('🧠 1 (2d)');
    });

    it('ignores non-markdown files and .md directories', () => {
        mockMemoryDir({
            'a.md': { mtimeMs: NOW - 10 * MINUTE },
            'notes.txt': { mtimeMs: NOW - MINUTE },
            'folder.md': { mtimeMs: NOW - MINUTE, isDirectory: true }
        });

        expect(render()).toBe('🧠 1 (10m)');
    });

    it('hides when only the MEMORY.md index exists', () => {
        mockMemoryDir({ 'MEMORY.md': { mtimeMs: NOW - MINUTE } });

        expect(render()).toBeNull();
    });

    it('hides when the memory directory is missing', () => {
        vi.spyOn(fs, 'readdirSync').mockImplementation(() => {
            throw new Error('ENOENT');
        });

        expect(render()).toBeNull();
    });

    it('hides when there is no transcript path', () => {
        mockMemoryDir({ 'a.md': { mtimeMs: NOW - MINUTE } });

        expect(render(undefined, makeContext({ data: {} }))).toBeNull();
        expect(render(undefined, makeContext({ data: undefined }))).toBeNull();
    });

    it('renders a fixed sample in preview mode', () => {
        expect(render(undefined, makeContext({ isPreview: true }))).toBe('🧠 3 (5m)');
        expect(render({ rawValue: true }, makeContext({ isPreview: true }))).toBe('3 (5m)');
    });

    it('exposes the memory count as numeric value', () => {
        mockMemoryDir({
            'MEMORY.md': { mtimeMs: NOW - MINUTE },
            'a.md': { mtimeMs: NOW - MINUTE },
            'b.md': { mtimeMs: NOW - MINUTE }
        });

        const widget = new ClaudeMemoryWidget();
        expect(widget.getNumericValue(makeContext(), { id: 'test', type: 'claude-memory' })).toBe(2);
    });
});
