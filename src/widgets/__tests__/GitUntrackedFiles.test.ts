import { execFileSync } from 'child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { expectGitExecOptions } from '../../utils/__tests__/git-test-helpers';
import { clearGitCache } from '../../utils/git';
import { GitUntrackedFilesWidget } from '../GitUntrackedFiles';

vi.mock('child_process', () => ({
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

const widget = new GitUntrackedFilesWidget();

function render(options: {
    cwd?: string;
    hide?: string;
    hideNoGit?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-untracked-files',
        type: 'git-untracked-files',
        rawValue: options.rawValue,
        metadata: options.hide ? { hide: options.hide } : (options.hideNoGit ? { hide: 'no-git' } : undefined)
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitUntrackedFilesWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('renders preview', () => {
        expect(render({ isPreview: true })).toBe('?:1');
    });

    it('renders preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('1');
    });

    it('renders untracked file count', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('M  a.ts\0 M b.ts\0?? c.ts\0?? d.ts\0');

        expect(render({ cwd: '/tmp/worktree' })).toBe('?:2');
        expectGitExecOptions(mockExecFileSync.mock.calls[0]?.[2], '/tmp/worktree');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['status', '--porcelain', '-z']);
    });

    it('renders raw untracked file count', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('?? a.ts\0?? b.ts\0');

        expect(render({ rawValue: true })).toBe('2');
    });

    it('renders zero count when repo is clean', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('?:0');
    });

    it('hides zero count when the zero state is enabled', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render({ hide: 'zero' })).toBeNull();
    });

    it('keeps non-zero counts visible with the zero state enabled', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('?? a.ts\0?? b.ts\0');

        expect(render({ hide: 'zero' })).toBe('?:2');
    });

    it('renders no git when probe returns false', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render()).toBe('(no git)');
    });

    it('hides no git when configured', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('renders no git when command fails', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('(no git)');
    });
});
