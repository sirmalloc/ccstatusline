import { execFileSync } from 'node:child_process';
import {
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../../types/Widget';
import { clearGitCache } from '../../utils/git';
import { renderOsc8Link } from '../../utils/hyperlink';
import { GitOriginOwnerWidget } from '../GitOriginOwner';
import { GitOriginOwnerRepoWidget } from '../GitOriginOwnerRepo';
import { GitOriginRepoWidget } from '../GitOriginRepo';
import { GitUpstreamOwnerWidget } from '../GitUpstreamOwner';
import { GitUpstreamOwnerRepoWidget } from '../GitUpstreamOwnerRepo';
import { GitUpstreamRepoWidget } from '../GitUpstreamRepo';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

// The widgets by type, imported directly: the full registry also loads widgets
// that need more of child_process than this mock provides
const WIDGETS_BY_TYPE: Record<string, Widget> = {
    'git-origin-owner': new GitOriginOwnerWidget(),
    'git-origin-repo': new GitOriginRepoWidget(),
    'git-origin-owner-repo': new GitOriginOwnerRepoWidget(),
    'git-upstream-owner': new GitUpstreamOwnerWidget(),
    'git-upstream-repo': new GitUpstreamRepoWidget(),
    'git-upstream-owner-repo': new GitUpstreamOwnerRepoWidget()
};
const getWidget = (type: string): Widget | undefined => WIDGETS_BY_TYPE[type];

const mockExecFileSync = execFileSync as unknown as { mockImplementation: (impl: (command: string, args: string[], options?: { cwd?: string }) => string) => void };

// A fork (origin and upstream on different owners), a clone with only origin,
// and a repository with no remotes, keyed by working directory
const repos = { fork: '/repos/fork', clone: '/repos/clone', bare: '/repos/bare' };
const REMOTE_URLS: Record<string, Record<string, string>> = {
    [repos.fork]: { origin: 'https://github.com/me/proj.git', upstream: 'git@github.com:them/proj.git' },
    [repos.clone]: { origin: 'https://gitlab.com/me/tool.git' },
    [repos.bare]: {}
};

// Answers `git remote get-url -- <name>` like git would; anything else, such as
// the tracking-branch lookup, fails as it does with no upstream branch set
beforeEach(() => {
    clearGitCache();
    mockExecFileSync.mockImplementation((_command, args, options) => {
        const url = args[0] === 'remote' && args[1] === 'get-url' ? REMOTE_URLS[options?.cwd ?? '']?.[args[3] ?? ''] : undefined;
        if (url === undefined) {
            throw new Error('fatal: no such remote');
        }
        return `${url}\n`;
    });
});

const live = (cwd: string): RenderContext => ({ isPreview: false, gitCacheTtlSeconds: 0, data: { cwd } });

function render(type: string, context: RenderContext, metadata?: Record<string, string>): string | null {
    const widget = getWidget(type);
    if (!widget) {
        throw new Error(`no widget registered for ${type}`);
    }
    const item: WidgetItem = { id: 'w', type, metadata };
    return widget.render(item, context, DEFAULT_SETTINGS);
}

// Each widget: its preview text and link, what it shows in the fork and the
// clone, its placeholder without the remote, and the state that hides it
const WIDGETS = [
    { type: 'git-origin-owner', preview: ['owner', 'https://github.com/owner/repo'], fork: 'me', clone: 'me', missing: 'no remote', hideKey: 'no-remote' },
    { type: 'git-origin-repo', preview: ['repo', 'https://github.com/owner/repo'], fork: 'proj', clone: 'tool', missing: 'no remote', hideKey: 'no-remote' },
    { type: 'git-origin-owner-repo', preview: ['owner/repo', 'https://github.com/owner/repo'], fork: 'me/proj', clone: 'me/tool', missing: 'no remote', hideKey: 'no-remote' },
    { type: 'git-upstream-owner', preview: ['upstream-owner', 'https://github.com/upstream-owner/repo'], fork: 'them', clone: null, missing: 'no upstream', hideKey: 'no-upstream' },
    { type: 'git-upstream-repo', preview: ['upstream-repo', 'https://github.com/upstream-owner/upstream-repo'], fork: 'proj', clone: null, missing: 'no upstream', hideKey: 'no-upstream' },
    { type: 'git-upstream-owner-repo', preview: ['upstream-owner/upstream-repo', 'https://github.com/upstream-owner/upstream-repo'], fork: 'them/proj', clone: null, missing: 'no upstream', hideKey: 'no-upstream' }
] as const;

describe.each(WIDGETS)('$type', ({ type, preview: [previewText, previewUrl], fork, clone, missing, hideKey }) => {
    it('shows sample text in the preview, linked when asked', () => {
        expect(render(type, { isPreview: true })).toBe(previewText);
        expect(render(type, { isPreview: true }, { linkToRepo: 'true' })).toBe(renderOsc8Link(previewUrl, previewText));
    });

    it('shows the remote\'s part, linked to the repository when asked', () => {
        expect(render(type, live(repos.fork))).toBe(fork);
        const linkUrl = type.startsWith('git-origin') ? 'https://github.com/me/proj' : 'https://github.com/them/proj';
        expect(render(type, live(repos.fork), { linkToRepo: 'true' })).toBe(renderOsc8Link(linkUrl, fork));
    });

    it('shows a placeholder without the remote, or nothing when that state is hidden', () => {
        expect(render(type, live(repos.bare))).toBe(missing);
        expect(render(type, live(repos.bare), { hide: hideKey })).toBeNull();
    });

    it('reads the clone too', () => {
        expect(render(type, live(repos.clone))).toBe(clone ?? missing);
    });

    it('offers the link toggle and labels it, and hides on the missing remote', () => {
        const widget = getWidget(type);
        expect(widget?.getCustomKeybinds?.().map(keybind => keybind.key)).toContain('l');
        expect(widget?.getEditorDisplay({ id: 'w', type, metadata: { linkToRepo: 'true' } }).modifierText).toContain('link');
        expect(widget?.getHideableStates?.().map(state => state.key)).toEqual([hideKey]);
        const toggled = widget?.handleEditorAction?.('toggle-link', { id: 'w', type });
        expect(toggled?.metadata?.linkToRepo).toBe('true');
        expect(widget?.supportsRawValue()).toBe(false);
        expect(widget?.getCategory()).toBe('Git');
    });
});

describe('git-origin-owner-repo owner only when fork', () => {
    const ownerOnly = { ownerOnlyWhenFork: 'true' };

    it('shows just the owner in a fork, and owner/repo otherwise', () => {
        expect(render('git-origin-owner-repo', live(repos.fork), ownerOnly)).toBe('me');
        expect(render('git-origin-owner-repo', live(repos.clone), ownerOnly)).toBe('me/tool');
        expect(render('git-origin-owner-repo', { isPreview: true }, ownerOnly)).toBe('owner');
    });

    it('toggles with (o) and labels it', () => {
        const widget = getWidget('git-origin-owner-repo');
        expect(widget?.getCustomKeybinds?.().map(keybind => keybind.key)).toEqual(['l', 'o']);
        expect(widget?.handleEditorAction?.('toggle-owner-only', { id: 'w', type: 'git-origin-owner-repo' })?.metadata).toEqual(ownerOnly);
        expect(widget?.getEditorDisplay({ id: 'w', type: 'git-origin-owner-repo', metadata: { linkToRepo: 'true', ...ownerOnly } }).modifierText)
            .toBe('(link, owner only when fork)');
    });
});
