import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { renderOsc8Link } from '../../utils/hyperlink';
import {
    GitPrWidget,
    type GitPrWidgetDeps
} from '../GitPr';

const SAMPLE_PR = {
    number: 123,
    reviewDecision: '',
    state: 'OPEN',
    title: 'Fix authentication bug',
    url: 'https://github.com/owner/repo/pull/123'
};

function createDeps(overrides: Partial<GitPrWidgetDeps> = {}): GitPrWidgetDeps {
    return {
        fetchGitReviewData: () => SAMPLE_PR,
        getProcessCwd: () => '/tmp/process-cwd',
        getRemoteInfo: () => null,
        isInsideGitWorkTree: () => true,
        resolveGitCwd: context => context.data?.cwd,
        ...overrides
    };
}

function render(
    options: {
        cwd?: string;
        hideNoGit?: boolean;
        hideStatus?: boolean;
        hideTitle?: boolean;
        isPreview?: boolean;
        rawValue?: boolean;
    } = {},
    depOverrides: Partial<GitPrWidgetDeps> = {}
): string | null {
    const widget = new GitPrWidget(createDeps(depOverrides));
    const context: RenderContext = {
        data: options.cwd ? { cwd: options.cwd } : undefined,
        isPreview: options.isPreview
    };
    const metadata: Record<string, string> = {};
    if (options.hideNoGit)
        metadata.hideNoGit = 'true';
    if (options.hideStatus)
        metadata.hideStatus = 'true';
    if (options.hideTitle)
        metadata.hideTitle = 'true';

    const item: WidgetItem = {
        id: 'git-review',
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        rawValue: options.rawValue,
        type: 'git-review'
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitPrWidget', () => {
    it('should render preview with OSC 8 link', () => {
        const result = render({ isPreview: true });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/42', 'PR #42')} OPEN Example PR title`
        );
    });

    it('should render preview with rawValue', () => {
        const result = render({ isPreview: true, rawValue: true });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/42', '#42')} OPEN Example PR title`
        );
    });

    it('should render preview without status when hideStatus enabled', () => {
        const result = render({ isPreview: true, hideStatus: true });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/42', 'PR #42')} Example PR title`
        );
    });

    it('should render preview without title when hideTitle enabled', () => {
        const result = render({ isPreview: true, hideTitle: true });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/42', 'PR #42')} OPEN`
        );
    });

    it('should render full PR display when PR data is available', () => {
        const result = render({ cwd: '/tmp/repo' });
        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/123', 'PR #123')} OPEN Fix authentication bug`
        );
    });

    it('should return (no PR) when not in git repo', () => {
        expect(render({ cwd: '/tmp/not-a-repo' }, { isInsideGitWorkTree: () => false })).toBe('(no PR)');
    });

    it('should return null when hideNoGit and not in git repo', () => {
        expect(render({ cwd: '/tmp/not-a-repo', hideNoGit: true }, { isInsideGitWorkTree: () => false })).toBeNull();
    });

    it('should return (no PR) when PR lookup returns null', () => {
        expect(render({}, {
            fetchGitReviewData: () => null,
            resolveGitCwd: () => undefined
        })).toBe('(no PR)');
    });

    it('should use process cwd when repo paths are omitted', () => {
        const fetchGitReviewData = vi.fn(() => SAMPLE_PR);

        const result = render({}, {
            fetchGitReviewData,
            getProcessCwd: () => '/tmp/process-cwd',
            resolveGitCwd: () => undefined
        });

        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/123', 'PR #123')} OPEN Fix authentication bug`
        );
        expect(fetchGitReviewData).toHaveBeenCalledWith('/tmp/process-cwd');
    });

    it('should truncate long titles', () => {
        const longPr = {
            ...SAMPLE_PR,
            title: 'This is a very long pull request title that exceeds the default limit'
        };

        const result = render({ cwd: '/tmp/repo' }, { fetchGitReviewData: () => longPr });
        expect(result).toContain('This is a very long pull requ\u2026');
    });

    it('should render MERGED status', () => {
        expect(render({ cwd: '/tmp/repo' }, { fetchGitReviewData: () => ({ ...SAMPLE_PR, state: 'MERGED' }) })).toContain('MERGED');
    });

    it('should render APPROVED status', () => {
        expect(render({ cwd: '/tmp/repo' }, {
            fetchGitReviewData: () => ({
                ...SAMPLE_PR,
                reviewDecision: 'APPROVED',
                state: 'OPEN'
            })
        })).toContain('APPROVED');
    });

    it('should render CHANGES_REQ status', () => {
        expect(render({ cwd: '/tmp/repo' }, {
            fetchGitReviewData: () => ({
                ...SAMPLE_PR,
                reviewDecision: 'CHANGES_REQUESTED',
                state: 'OPEN'
            })
        })).toContain('CHANGES_REQ');
    });

    it('should render "MR #N" for GitLab PR URLs', () => {
        const gitlabPr = {
            ...SAMPLE_PR,
            url: 'https://gitlab.com/owner/repo/-/merge_requests/123'
        };
        expect(render({ cwd: '/tmp/repo' }, { fetchGitReviewData: () => gitlabPr })).toBe(
            `${renderOsc8Link('https://gitlab.com/owner/repo/-/merge_requests/123', 'MR #123')} OPEN Fix authentication bug`
        );
    });

    it('should render raw "#N" regardless of forge', () => {
        const gitlabPr = {
            ...SAMPLE_PR,
            url: 'https://gitlab.com/owner/repo/-/merge_requests/123'
        };
        expect(render({ cwd: '/tmp/repo', rawValue: true }, { fetchGitReviewData: () => gitlabPr })).toBe(
            `${renderOsc8Link('https://gitlab.com/owner/repo/-/merge_requests/123', '#123')} OPEN Fix authentication bug`
        );
    });

    it('should return (no MR) when origin is GitLab and no MR exists', () => {
        expect(render({ cwd: '/tmp/repo' }, {
            fetchGitReviewData: () => null,
            getRemoteInfo: () => ({
                name: 'origin',
                url: 'git@gitlab.com:owner/repo.git',
                host: 'gitlab.com',
                owner: 'owner',
                repo: 'repo'
            })
        })).toBe('(no MR)');
    });

    it('should keep "PR #N" for GitHub PR URLs (regression guard)', () => {
        expect(render({ cwd: '/tmp/repo' })).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/123', 'PR #123')} OPEN Fix authentication bug`
        );
    });

    it('should render "MR #N" for self-hosted GitLab via URL pattern when provider field is missing', () => {
        // Simulates a cache entry written by an older version of the cache
        // layer that predates the `provider` field. The URL points at a
        // self-hosted GitLab host whose name does not contain "gitlab".
        const legacyCacheEntry = {
            number: 1626,
            reviewDecision: '',
            state: 'OPEN',
            title: 'Add optional wallet type field',
            url: 'https://git.example.com/group/project/-/merge_requests/1626'
        };
        expect(render({ cwd: '/tmp/repo' }, { fetchGitReviewData: () => legacyCacheEntry })).toBe(
            `${renderOsc8Link('https://git.example.com/group/project/-/merge_requests/1626', 'MR #1626')} OPEN Add optional wallet type field`
        );
    });

    it('should render "MR #N" for self-hosted GitLab based on provider, not URL', () => {
        const selfHostedMr = {
            ...SAMPLE_PR,
            number: 7,
            url: 'https://git.example.com/team/repo/-/merge_requests/7',
            provider: 'glab' as const
        };
        expect(render({ cwd: '/tmp/repo' }, { fetchGitReviewData: () => selfHostedMr })).toBe(
            `${renderOsc8Link('https://git.example.com/team/repo/-/merge_requests/7', 'MR #7')} OPEN Fix authentication bug`
        );
    });

    it('should return (no MR) for self-hosted GitLab origins when glab is the candidate', () => {
        expect(render({ cwd: '/tmp/repo' }, {
            fetchGitReviewData: () => null,
            getRemoteInfo: () => ({
                name: 'origin',
                url: 'git@git.example.com:team/repo.git',
                // Host doesn't contain "gitlab" — empty-state noun will stay
                // "PR" here because we can't know the forge without a probe.
                // Once a user has fetched at least one MR the provider-based
                // path above kicks in.
                host: 'git.example.com',
                owner: 'team',
                repo: 'repo'
            })
        })).toBe('(no PR)');
    });
});
