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
import { clearGitCache } from '../../utils/git';
import { GitStagedFilesWidget } from '../GitStagedFiles';

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

const widget = new GitStagedFilesWidget();

function render(options: {
    cwd?: string;
    hideNoGit?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-staged-files',
        type: 'git-staged-files',
        rawValue: options.rawValue,
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitStagedFilesWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('renders preview', () => {
        expect(render({ isPreview: true })).toBe('S:3');
    });

    it('renders preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('3');
    });

    it('renders staged file count', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('M  a.ts\0A  b.ts\0 M c.ts\0?? d.ts\0');

        expect(render({ cwd: '/tmp/worktree' })).toBe('S:2');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['rev-parse', '--is-inside-work-tree']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['--no-optional-locks', 'status', '--porcelain', '-z']);
    });

    it('renders raw staged file count', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('M  a.ts\0A  b.ts\0');

        expect(render({ rawValue: true })).toBe('2');
    });

    it('renders zero count when repo is clean', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('S:0');
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
