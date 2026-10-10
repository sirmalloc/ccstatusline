import { execFileSync } from 'node:child_process';
import {
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
import { mockExecutableResolution } from '../../utils/__tests__/executable-path-test-helpers';
import { expectGitExecOptions } from '../../utils/__tests__/git-test-helpers';
import { clearGitCache } from '../../utils/git';
import { GIT_HARDENING_ARGS } from '../../utils/git-hardening';
import { GitWorktreeWidget } from '../GitWorktree';

vi.mock('node:child_process', () => ({
    execSync: vi.fn(),
    execFileSync: vi.fn(),
    spawnSync: vi.fn()
}));

const mockExecFileSync = execFileSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoGit?: boolean;
    isPreview?: boolean;
    rawValue?: boolean;
} = {}) {
    const widget = new GitWorktreeWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-worktree',
        type: 'git-worktree',
        rawValue: options.rawValue,
        metadata: options.hideNoGit ? { hide: 'no-git' } : undefined
    };

    return widget.render(item, context);
}

mockExecutableResolution();

describe('GitWorktreeWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('𖠰 main');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('main');
    });

    it('should render with worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/.git/worktrees/some-worktree\n/some/path/.git\n');

        expect(render({ cwd: '/tmp/worktree' })).toBe('𖠰 some-worktree');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('git');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual([...GIT_HARDENING_ARGS, 'rev-parse', '--is-inside-work-tree']);
        expectGitExecOptions(mockExecFileSync.mock.calls[0]?.[2], '/tmp/worktree');
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe('git');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual([...GIT_HARDENING_ARGS, 'rev-parse', '--git-dir', '--git-common-dir']);
        expectGitExecOptions(mockExecFileSync.mock.calls[1]?.[2], '/tmp/worktree');
    });

    it('should render with nested worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/.git/worktrees/some-dir/some-worktree\n/some/path/.git\n');

        expect(render()).toBe('𖠰 some-dir/some-worktree');
    });

    it('should render with no worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('.git\n.git\n');

        expect(render()).toBe('𖠰 main');
    });

    it('should render main from a subdirectory of the main worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/repo/.git\n../../.git\n');

        expect(render()).toBe('𖠰 main');
    });

    it.each([
        { name: 'a submodule', gitDir: '/super/.git/modules/sub' },
        { name: 'a submodule of a repo under a worktrees directory', gitDir: '/home/me/worktrees/super/.git/modules/sub' },
        { name: 'a repo with a separate git dir', gitDir: '/elsewhere/repo.git' }
    ])('should render main in $name', ({ gitDir }) => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce(`${gitDir}\n${gitDir}\n`);

        expect(render()).toBe('𖠰 main');
    });

    it('should handle windows git-dir paths', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('C:\\repo\\.git\\worktrees\\some-worktree\nC:\\repo\\.git\n');

        expect(render()).toBe('𖠰 some-worktree');
    });

    it('should render with no git when probe returns false', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render()).toBe('𖠰 no git');
    });

    it('should render with no git', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('𖠰 no git');
    });

    it('should hide no git when configured', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should render with invalid git dir', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('');

        expect(render()).toBe('𖠰 no git');
    });

    it('should render with bare repo worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/worktrees/some-worktree\n/some/path\n');

        expect(render()).toBe('𖠰 some-worktree');
    });

    it('should render with nested bare repo worktree', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/worktrees/some-dir/some-worktree\n/some/path\n');

        expect(render()).toBe('𖠰 some-dir/some-worktree');
    });

    it('should handle windows bare repo git-dir paths', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('C:\\repo\\worktrees\\some-worktree\nC:\\repo\n');

        expect(render()).toBe('𖠰 some-worktree');
    });
});
