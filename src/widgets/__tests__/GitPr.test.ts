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
        fetchPrData: () => SAMPLE_PR,
        getProcessCwd: () => '/tmp/process-cwd',
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
        id: 'git-pr',
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        rawValue: options.rawValue,
        type: 'git-pr'
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
            fetchPrData: () => null,
            resolveGitCwd: () => undefined
        })).toBe('(no PR)');
    });

    it('should use process cwd when repo paths are omitted', () => {
        const fetchPrData = vi.fn(() => SAMPLE_PR);

        const result = render({}, {
            fetchPrData,
            getProcessCwd: () => '/tmp/process-cwd',
            resolveGitCwd: () => undefined
        });

        expect(result).toBe(
            `${renderOsc8Link('https://github.com/owner/repo/pull/123', 'PR #123')} OPEN Fix authentication bug`
        );
        expect(fetchPrData).toHaveBeenCalledWith('/tmp/process-cwd');
    });

    it('should truncate long titles', () => {
        const longPr = {
            ...SAMPLE_PR,
            title: 'This is a very long pull request title that exceeds the default limit'
        };

        const result = render({ cwd: '/tmp/repo' }, { fetchPrData: () => longPr });
        expect(result).toContain('This is a very long pull requ\u2026');
    });

    it('should render MERGED status', () => {
        expect(render({ cwd: '/tmp/repo' }, { fetchPrData: () => ({ ...SAMPLE_PR, state: 'MERGED' }) })).toContain('MERGED');
    });

    it('should render APPROVED status', () => {
        expect(render({ cwd: '/tmp/repo' }, {
            fetchPrData: () => ({
                ...SAMPLE_PR,
                reviewDecision: 'APPROVED',
                state: 'OPEN'
            })
        })).toContain('APPROVED');
    });

    it('should render CHANGES_REQ status', () => {
        expect(render({ cwd: '/tmp/repo' }, {
            fetchPrData: () => ({
                ...SAMPLE_PR,
                reviewDecision: 'CHANGES_REQUESTED',
                state: 'OPEN'
            })
        })).toContain('CHANGES_REQ');
    });
});