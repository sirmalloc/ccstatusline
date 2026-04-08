import { execSync } from 'child_process';
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
import { renderOsc8Link } from '../../utils/hyperlink';
import { GitBranchWidget } from '../GitBranch';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

const mockExecSync = execSync as unknown as {
    mock: { calls: unknown[][] };
    mockImplementation: (impl: () => never) => void;
    mockReturnValue: (value: string) => void;
    mockReturnValueOnce: (value: string) => void;
};

function render(options: {
    cwd?: string;
    hideNoGit?: boolean;
    isPreview?: boolean;
    linkToGitHub?: boolean;
    metadata?: Record<string, string>;
    rawValue?: boolean;
} = {}) {
    const widget = new GitBranchWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const metadata = {
        ...options.metadata,
        ...(options.hideNoGit ? { hideNoGit: 'true' } : {}),
        ...(options.linkToGitHub ? { linkToGitHub: 'true' } : {})
    };
    const item: WidgetItem = {
        id: 'git-branch',
        type: 'git-branch',
        rawValue: options.rawValue,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitBranchWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('⎇ main');
    });

    it('should render preview with raw value', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('main');
    });

    it('should render branch name', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('feature/worktree');

        expect(render({ cwd: '/tmp/worktree' })).toBe('⎇ feature/worktree');
        expect(mockExecSync.mock.calls[0]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecSync.mock.calls[1]?.[1]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
    });

    it('should render raw branch value', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('feature/worktree');

        expect(render({ rawValue: true })).toBe('feature/worktree');
    });

    it('should render encoded GitHub branch links', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('feature/issue#1');
        mockExecSync.mockReturnValueOnce('ssh://git@github.com/owner/repo.git');

        expect(render({ linkToGitHub: true })).toBe(renderOsc8Link(
            'https://github.com/owner/repo/tree/feature/issue%231',
            '⎇ feature/issue#1'
        ));
    });

    it('should render no git when probe returns false', () => {
        mockExecSync.mockReturnValue('false\n');

        expect(render()).toBe('⎇ no git');
    });

    it('should hide no git when configured', () => {
        mockExecSync.mockReturnValue('false\n');

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should render no git when branch lookup is empty', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('');

        expect(render()).toBe('⎇ no git');
    });

    it('should render no git when command fails', () => {
        mockExecSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('⎇ no git');
    });

    it('should keep plain text when GitHub remote cannot be parsed', () => {
        mockExecSync.mockReturnValueOnce('true\n');
        mockExecSync.mockReturnValueOnce('feature/worktree');
        mockExecSync.mockReturnValueOnce('https://gitlab.com/owner/repo.git');

        expect(render({ linkToGitHub: true })).toBe('⎇ feature/worktree');
    });
});