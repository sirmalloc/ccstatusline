import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import type { GitCiState } from '../../utils/git-review-cache';
import {
    GitCiStatusWidget,
    type GitCiStatusWidgetDeps
} from '../GitCiStatus';

function prWithChecks(state: GitCiState, failing: number, pending: number, success: number) {
    return {
        number: 123,
        reviewDecision: '',
        state: 'OPEN',
        title: 'Fix authentication bug',
        url: 'https://github.com/owner/repo/pull/123',
        checks: { state, failing, pending, success }
    };
}

const PASSING_PR = prWithChecks('passing', 0, 0, 5);

function createDeps(overrides: Partial<GitCiStatusWidgetDeps> = {}): GitCiStatusWidgetDeps {
    return {
        getCachedGitReviewData: () => PASSING_PR,
        getProcessCwd: () => '/tmp/process-cwd',
        isInsideGitWorkTree: () => true,
        resolveGitCwd: context => context.data?.cwd,
        ...overrides
    };
}

function render(
    options: { cwd?: string; hideNoGit?: boolean; isPreview?: boolean; rawValue?: boolean } = {},
    depOverrides: Partial<GitCiStatusWidgetDeps> = {}
): string | null {
    const widget = new GitCiStatusWidget(createDeps(depOverrides));
    const context: RenderContext = {
        data: options.cwd ? { cwd: options.cwd } : undefined,
        isPreview: options.isPreview
    };
    const item: WidgetItem = {
        id: 'git-ci-status',
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined,
        rawValue: options.rawValue,
        type: 'git-ci-status'
    };
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitCiStatusWidget', () => {
    it('renders preview', () => {
        expect(render({ isPreview: true })).toBe('✗1 ●1 ✓5');
    });

    it('renders preview rawValue as the state word', () => {
        expect(render({ isPreview: true, rawValue: true })).toBe('failing');
    });

    it.each([
        ['all green', prWithChecks('passing', 0, 0, 5), '✓5'],
        ['failing only', prWithChecks('failing', 1, 0, 4), '✗1 ✓4'],
        ['pending only', prWithChecks('pending', 0, 3, 2), '●3 ✓2'],
        ['mixed', prWithChecks('failing', 1, 1, 97), '✗1 ●1 ✓97'],
        ['zeros are hidden', prWithChecks('failing', 2, 0, 0), '✗2']
    ])('renders %s as non-zero glyph + count', (_label, pr, expected) => {
        expect(render({ cwd: '/tmp/repo' }, { getCachedGitReviewData: () => pr })).toBe(expected);
    });

    it('falls back to ✓0 when only skipped/neutral checks exist', () => {
        const allIgnored = prWithChecks('passing', 0, 0, 0);
        expect(render({ cwd: '/tmp/repo' }, { getCachedGitReviewData: () => allIgnored })).toBe('✓0');
    });

    it.each([
        ['passing', prWithChecks('passing', 0, 0, 5), 'passing'],
        ['failing', prWithChecks('failing', 1, 0, 4), 'failing'],
        ['pending', prWithChecks('pending', 0, 3, 2), 'pending']
    ])('renders rawValue %s as the state word', (_label, pr, expected) => {
        expect(render({ cwd: '/tmp/repo', rawValue: true }, { getCachedGitReviewData: () => pr })).toBe(expected);
    });

    it('renders "-" when no PR exists', () => {
        expect(render({ cwd: '/tmp/repo' }, { getCachedGitReviewData: () => null })).toBe('-');
    });

    it('renders "-" when the PR has no checks', () => {
        const noChecks = { ...PASSING_PR, checks: undefined };
        expect(render({ cwd: '/tmp/repo' }, { getCachedGitReviewData: () => noChecks })).toBe('-');
    });

    it('returns (no git) when not in a git repo', () => {
        expect(render({ cwd: '/x' }, { isInsideGitWorkTree: () => false })).toBe('(no git)');
    });

    it('returns null when hideNoGit and not in a git repo', () => {
        expect(render({ cwd: '/x', hideNoGit: true }, { isInsideGitWorkTree: () => false })).toBeNull();
    });

    it('uses process cwd when repo path is omitted', () => {
        const getCachedGitReviewData = vi.fn(() => PASSING_PR);
        render({}, { getCachedGitReviewData, resolveGitCwd: () => undefined });
        expect(getCachedGitReviewData).toHaveBeenCalledWith('/tmp/process-cwd', { includeChecks: true });
    });
});
