import { execSync } from 'child_process';
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
import { GitIndicatorsWidget } from '../GitIndicators';

vi.mock('child_process', () => ({ execSync: vi.fn() }));

function createItem(options: Partial<WidgetItem> = {}): WidgetItem {
    return {
        id: 'git-indicators',
        type: 'git-indicators',
        ...options
    };
}

function render(item: WidgetItem, isPreview = false) {
    const widget = new GitIndicatorsWidget();
    const context: RenderContext = { isPreview };
    return widget.render(item, context, {} as any);
}

describe('GitIndicatorsWidget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('preview mode', () => {
        it('should render preview without colors', () => {
            const item = createItem({ preserveColors: false });
            expect(render(item, true)).toBe('+*');
        });

        it('should render preview with colors', () => {
            const item = createItem({ preserveColors: true });
            expect(render(item, true)).toBe('\x1b[32m+\x1b[0m\x1b[31m*\x1b[0m');
        });
    });

    describe('not in git repo', () => {
        beforeEach(() => {
            vi.mocked(execSync).mockImplementation(() => {
                throw new Error('Not a git repo');
            });
        });

        it('should return empty string when not in git repo', () => {
            const item = createItem();
            expect(render(item)).toBe('');
        });

        it('should return null when hideNoGit is true', () => {
            const item = createItem({ metadata: { hideNoGit: 'true' } });
            expect(render(item)).toBeNull();
        });
    });

    describe('in git repo', () => {
        it('should return empty string when no changes', () => {
            // All git commands succeed (no changes)
            vi.mocked(execSync).mockReturnValue('');

            const item = createItem();
            expect(render(item)).toBe('');
        });

        it('should return + for staged changes only', () => {
            vi.mocked(execSync).mockImplementation((cmd: string) => {
                if (cmd === 'git rev-parse --git-dir') return '.git';
                if (cmd === 'git diff --staged --quiet') throw new Error('Changes exist');
                if (cmd === 'git diff --quiet') return '';
                return '';
            });

            const item = createItem();
            expect(render(item)).toBe('+');
        });

        it('should return * for unstaged changes only', () => {
            vi.mocked(execSync).mockImplementation((cmd: string) => {
                if (cmd === 'git rev-parse --git-dir') return '.git';
                if (cmd === 'git diff --staged --quiet') return '';
                if (cmd === 'git diff --quiet') throw new Error('Changes exist');
                return '';
            });

            const item = createItem();
            expect(render(item)).toBe('*');
        });

        it('should return +* for both staged and unstaged changes', () => {
            vi.mocked(execSync).mockImplementation((cmd: string) => {
                if (cmd === 'git rev-parse --git-dir') return '.git';
                if (cmd === 'git diff --staged --quiet') throw new Error('Changes exist');
                if (cmd === 'git diff --quiet') throw new Error('Changes exist');
                return '';
            });

            const item = createItem();
            expect(render(item)).toBe('+*');
        });
    });

    describe('with preserveColors', () => {
        it('should return colored + for staged changes', () => {
            vi.mocked(execSync).mockImplementation((cmd: string) => {
                if (cmd === 'git rev-parse --git-dir') return '.git';
                if (cmd === 'git diff --staged --quiet') throw new Error('Changes exist');
                if (cmd === 'git diff --quiet') return '';
                return '';
            });

            const item = createItem({ preserveColors: true });
            expect(render(item)).toBe('\x1b[32m+\x1b[0m');
        });

        it('should return colored * for unstaged changes', () => {
            vi.mocked(execSync).mockImplementation((cmd: string) => {
                if (cmd === 'git rev-parse --git-dir') return '.git';
                if (cmd === 'git diff --staged --quiet') return '';
                if (cmd === 'git diff --quiet') throw new Error('Changes exist');
                return '';
            });

            const item = createItem({ preserveColors: true });
            expect(render(item)).toBe('\x1b[31m*\x1b[0m');
        });

        it('should return colored +* for both changes', () => {
            vi.mocked(execSync).mockImplementation((cmd: string) => {
                if (cmd === 'git rev-parse --git-dir') return '.git';
                if (cmd === 'git diff --staged --quiet') throw new Error('Changes exist');
                if (cmd === 'git diff --quiet') throw new Error('Changes exist');
                return '';
            });

            const item = createItem({ preserveColors: true });
            expect(render(item)).toBe('\x1b[32m+\x1b[0m\x1b[31m*\x1b[0m');
        });
    });

    describe('widget metadata', () => {
        it('should have correct default color', () => {
            const widget = new GitIndicatorsWidget();
            expect(widget.getDefaultColor()).toBe('white');
        });

        it('should have correct display name', () => {
            const widget = new GitIndicatorsWidget();
            expect(widget.getDisplayName()).toBe('Git Indicators');
        });

        it('should have correct description', () => {
            const widget = new GitIndicatorsWidget();
            expect(widget.getDescription()).toBe('Shows git status indicators: + for staged, * for unstaged changes');
        });

        it('should not support raw value', () => {
            const widget = new GitIndicatorsWidget();
            expect(widget.supportsRawValue()).toBe(false);
        });

        it('should support colors', () => {
            const widget = new GitIndicatorsWidget();
            expect(widget.supportsColors({} as WidgetItem)).toBe(true);
        });
    });

    describe('editor display', () => {
        it('should show display name without modifiers', () => {
            const widget = new GitIndicatorsWidget();
            const item = createItem();
            const display = widget.getEditorDisplay(item);

            expect(display.displayText).toBe('Git Indicators');
            expect(display.modifierText).toBeUndefined();
        });

        it('should show hideNoGit modifier when enabled', () => {
            const widget = new GitIndicatorsWidget();
            const item = createItem({ metadata: { hideNoGit: 'true' } });
            const display = widget.getEditorDisplay(item);

            expect(display.displayText).toBe('Git Indicators');
            expect(display.modifierText).toBe("(hide 'no git')");
        });
    });

    describe('handleEditorAction', () => {
        it('should toggle hideNoGit from false to true', () => {
            const widget = new GitIndicatorsWidget();
            const item = createItem();
            const result = widget.handleEditorAction('toggle-nogit', item);

            expect(result?.metadata?.hideNoGit).toBe('true');
        });

        it('should toggle hideNoGit from true to false', () => {
            const widget = new GitIndicatorsWidget();
            const item = createItem({ metadata: { hideNoGit: 'true' } });
            const result = widget.handleEditorAction('toggle-nogit', item);

            expect(result?.metadata?.hideNoGit).toBe('false');
        });

        it('should return null for unknown action', () => {
            const widget = new GitIndicatorsWidget();
            const item = createItem();
            const result = widget.handleEditorAction('unknown-action', item);

            expect(result).toBeNull();
        });
    });

    describe('custom keybinds', () => {
        it('should have toggle-nogit keybind', () => {
            const widget = new GitIndicatorsWidget();
            const keybinds = widget.getCustomKeybinds();

            expect(keybinds).toHaveLength(1);
            expect(keybinds[0]).toEqual({
                key: 'h',
                label: "(h)ide 'no git' message",
                action: 'toggle-nogit'
            });
        });
    });
});
