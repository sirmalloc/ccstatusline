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
import {
    buildIdeFileUrl,
    renderOsc8Link
} from '../../utils/hyperlink';
import { GitRootDirWidget } from '../GitRootDir';

vi.mock('child_process', () => ({
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

function render(options: { cwd?: string; hideNoGit?: boolean; isPreview?: boolean } = {}) {
    const widget = new GitRootDirWidget();
    const context: RenderContext = {
        isPreview: options.isPreview,
        data: options.cwd ? { cwd: options.cwd } : undefined
    };
    const item: WidgetItem = {
        id: 'git-root-dir',
        type: 'git-root-dir',
        metadata: options.hideNoGit ? { hideNoGit: 'true' } : undefined
    };

    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('GitRootDirWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearGitCache();
    });

    it('should render preview', () => {
        expect(render({ isPreview: true })).toBe('my-repo');
    });

    it('should render preview for vscode IDE links', () => {
        const widget = new GitRootDirWidget();

        expect(widget.render({
            id: 'git-root-dir',
            type: 'git-root-dir',
            metadata: { linkToIDE: 'vscode' }
        }, { isPreview: true }, DEFAULT_SETTINGS)).toBe(renderOsc8Link(
            buildIdeFileUrl('/Users/example/my-repo', 'vscode'),
            'my-repo'
        ));
    });

    it('should render root directory name', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/my-repo');

        expect(render({ cwd: '/tmp/worktree' })).toBe('my-repo');
        expect(mockExecFileSync.mock.calls[0]?.[0]).toBe('git');
        expect(mockExecFileSync.mock.calls[0]?.[1]).toEqual(['rev-parse', '--is-inside-work-tree']);
        expect(mockExecFileSync.mock.calls[0]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
        expect(mockExecFileSync.mock.calls[1]?.[0]).toBe('git');
        expect(mockExecFileSync.mock.calls[1]?.[1]).toEqual(['rev-parse', '--show-toplevel']);
        expect(mockExecFileSync.mock.calls[1]?.[2]).toEqual({
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd: '/tmp/worktree'
        });
    });

    it('should handle trailing separators', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/my-repo/');

        expect(render()).toBe('my-repo');
    });

    it('should render unix root path without returning empty output', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/');

        expect(render()).toBe('/');
    });

    it('should render windows drive root without returning empty output', () => {
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('C:/');

        expect(render()).toBe('C:');
    });

    it('should render encoded vscode IDE links for repository roots', () => {
        const widget = new GitRootDirWidget();
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('C:/Work/my repo#1');

        expect(widget.render({
            id: 'git-root-dir',
            type: 'git-root-dir',
            metadata: { linkToIDE: 'vscode' }
        }, {}, DEFAULT_SETTINGS)).toBe(renderOsc8Link(
            buildIdeFileUrl('C:/Work/my repo#1', 'vscode'),
            'my repo#1'
        ));
    });

    it('should continue honoring legacy cursor link metadata', () => {
        const widget = new GitRootDirWidget();
        mockExecFileSync.mockReturnValueOnce('true\n');
        mockExecFileSync.mockReturnValueOnce('/some/path/my repo#1');

        expect(widget.render({
            id: 'git-root-dir',
            type: 'git-root-dir',
            metadata: { linkToCursor: 'true' }
        }, {}, DEFAULT_SETTINGS)).toBe(renderOsc8Link(
            buildIdeFileUrl('/some/path/my repo#1', 'cursor'),
            'my repo#1'
        ));
    });

    it('should render no git when probe returns false', () => {
        mockExecFileSync.mockReturnValue('false\n');

        expect(render()).toBe('no git');
    });

    it('should render no git when command fails', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render()).toBe('no git');
    });

    it('should hide no git when configured', () => {
        mockExecFileSync.mockImplementation(() => { throw new Error('No git'); });

        expect(render({ hideNoGit: true })).toBeNull();
    });

    it('should cycle IDE link modes in the editor', () => {
        const widget = new GitRootDirWidget();
        const base: WidgetItem = { id: 'git-root-dir', type: 'git-root-dir' };

        const vscode = widget.handleEditorAction('toggle-link', base);
        const cursor = widget.handleEditorAction('toggle-link', vscode ?? base);
        const cleared = widget.handleEditorAction('toggle-link', cursor ?? base);

        expect(vscode?.metadata?.linkToIDE).toBe('vscode');
        expect(cursor?.metadata?.linkToIDE).toBe('cursor');
        expect(cleared?.metadata?.linkToIDE).toBeUndefined();
    });

    it('should migrate legacy cursor metadata when cycling IDE link modes', () => {
        const widget = new GitRootDirWidget();
        const updated = widget.handleEditorAction('toggle-link', {
            id: 'git-root-dir',
            type: 'git-root-dir',
            metadata: { linkToCursor: 'true' }
        });

        expect(updated?.metadata?.linkToCursor).toBeUndefined();
        expect(updated?.metadata?.linkToIDE).toBeUndefined();
    });

    it('should show IDE link modifier text in the editor display', () => {
        const widget = new GitRootDirWidget();
        const display = widget.getEditorDisplay({
            id: 'git-root-dir',
            type: 'git-root-dir',
            metadata: { linkToIDE: 'cursor' }
        });

        expect(display.modifierText).toBe('(link-cursor)');
    });

    it('should expose IDE link keybind', () => {
        const widget = new GitRootDirWidget();

        expect(widget.getCustomKeybinds()).toContainEqual({
            key: 'l',
            label: '(l)ink to IDE',
            action: 'toggle-link'
        });
    });

    it('should disable raw value support', () => {
        const widget = new GitRootDirWidget();

        expect(widget.supportsRawValue()).toBe(false);
    });
});
