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
    options: { cwd?: string; hide?: string; isPreview?: boolean; rawValue?: boolean } = {},
    depOverrides: Partial<GitCiStatusWidgetDeps> = {}
): string | null {
    const widget = new GitCiStatusWidget(createDeps(depOverrides));
    const context: RenderContext = {
        data: options.cwd ? { cwd: options.cwd } : undefined,
        isPreview: options.isPreview
    };
    const item: WidgetItem = {
        id: 'git-ci-status',
        metadata: options.hide === undefined ? undefined : { hide: options.hide },
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

    it('returns null when the no-git state is enabled and not in a git repo', () => {
        expect(render({ cwd: '/x', hide: 'no-git' }, { isInsideGitWorkTree: () => false })).toBeNull();
    });

    it('declares the no-git and no-data hideable states', () => {
        expect(new GitCiStatusWidget(createDeps()).getHideableStates().map(state => state.key))
            .toEqual(['no-git', 'no-data']);
    });

    it.each([
        ['no PR exists', null],
        ['the PR has no checks', { ...PASSING_PR, checks: undefined }]
    ])('returns null when the no-data state is enabled and %s', (_label, pr) => {
        expect(render({ cwd: '/tmp/repo', hide: 'no-data' }, { getCachedGitReviewData: () => pr })).toBeNull();
    });

    // The two gates cover different conditions, so neither may stand in for the
    // other.
    it('keeps rendering "-" when only the no-git state is enabled', () => {
        expect(render({ cwd: '/tmp/repo', hide: 'no-git' }, { getCachedGitReviewData: () => null })).toBe('-');
    });

    it('keeps rendering (no git) when only the no-data state is enabled', () => {
        expect(render({ cwd: '/x', hide: 'no-data' }, { isInsideGitWorkTree: () => false })).toBe('(no git)');
    });

    it.each([
        ['outside a repo', { isInsideGitWorkTree: () => false }],
        ['with no check data', { getCachedGitReviewData: () => null }]
    ])('returns null %s when both states are enabled', (_label, depOverrides) => {
        expect(render({ cwd: '/tmp/repo', hide: 'no-git,no-data' }, depOverrides)).toBeNull();
    });

    it('uses process cwd when repo path is omitted', () => {
        const getCachedGitReviewData = vi.fn(() => PASSING_PR);
        render({}, { getCachedGitReviewData, resolveGitCwd: () => undefined });
        expect(getCachedGitReviewData).toHaveBeenCalledWith('/tmp/process-cwd', { includeChecks: true });
    });
});
