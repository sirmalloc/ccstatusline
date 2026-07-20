import {
    afterEach,
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
import { DEFAULT_SETTINGS } from '../../types/Settings';
import * as claudeSettings from '../../utils/claude-settings';
import { SandboxStatusWidget } from '../SandboxStatus';

const ITEM: WidgetItem = { id: 'sandbox-status', type: 'sandbox-status' };

const LOCK = '';
const UNLOCK = '';

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
    return { ...overrides };
}

beforeEach(() => {
    vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: false });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SandboxStatusWidget', () => {
    describe('metadata', () => {
        it('has correct display name', () => {
            expect(new SandboxStatusWidget().getDisplayName()).toBe('Sandbox Status');
        });

        it('has correct description', () => {
            expect(new SandboxStatusWidget().getDescription()).toBe([
                'Shows whether Claude Code bash sandbox mode is enabled',
                'Best effort: may not reflect active sandboxing when managed or CLI settings override it, or when sandbox initialization fails.'
            ].join('\n'));
        });

        it('has correct category', () => {
            expect(new SandboxStatusWidget().getCategory()).toBe('Core');
        });

        it('has green default color', () => {
            expect(new SandboxStatusWidget().getDefaultColor()).toBe('green');
        });

        it('supports raw value', () => {
            expect(new SandboxStatusWidget().supportsRawValue()).toBe(true);
        });

        it('supports colors', () => {
            expect(new SandboxStatusWidget().supportsColors(ITEM)).toBe(true);
        });
    });

    describe('editor configuration', () => {
        it('exposes f and n keybinds', () => {
            expect(new SandboxStatusWidget().getCustomKeybinds()).toEqual([
                { key: 'f', label: '(f)ormat', action: 'cycle-format' },
                { key: 'n', label: '(n)erd font', action: 'toggle-nerd-font' }
            ]);
        });

        it('defaults to glyph in the editor display', () => {
            expect(new SandboxStatusWidget().getEditorDisplay(ITEM)).toEqual({
                displayText: 'Sandbox Status',
                modifierText: '(glyph)'
            });
        });

        it('shows the configured format and nerd font in the editor display', () => {
            expect(new SandboxStatusWidget().getEditorDisplay({
                ...ITEM,
                metadata: { format: 'word', nerdFont: 'true' }
            })).toEqual({
                displayText: 'Sandbox Status',
                modifierText: '(word, nerd font)'
            });
        });

        it('cycles glyph -> text -> word -> bare -> glyph', () => {
            const widget = new SandboxStatusWidget();
            const text = widget.handleEditorAction('cycle-format', ITEM);
            const word = widget.handleEditorAction('cycle-format', text ?? ITEM);
            const bare = widget.handleEditorAction('cycle-format', word ?? ITEM);
            const back = widget.handleEditorAction('cycle-format', bare ?? ITEM);

            expect(text?.metadata?.format).toBe('text');
            expect(word?.metadata?.format).toBe('word');
            expect(bare?.metadata?.format).toBe('bare');
            expect(back?.metadata?.format).toBeUndefined();
        });

        it('toggles nerd font metadata on and off', () => {
            const widget = new SandboxStatusWidget();
            const enabled = widget.handleEditorAction('toggle-nerd-font', ITEM);
            const disabled = widget.handleEditorAction('toggle-nerd-font', enabled ?? ITEM);

            expect(enabled?.metadata?.nerdFont).toBe('true');
            expect(disabled?.metadata?.nerdFont).toBeUndefined();
        });

        it('returns null for unknown editor actions', () => {
            expect(new SandboxStatusWidget().handleEditorAction('unknown', ITEM)).toBeNull();
        });
    });

    describe('render() - format glyph (default), standard glyphs', () => {
        it('renders SB: ○ when OFF', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: false });
            expect(new SandboxStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('SB: ○');
        });

        it('renders SB: ● when ON', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: true });
            expect(new SandboxStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('SB: ●');
        });
    });

    describe('render() - format glyph, Nerd Font', () => {
        const NERD_ITEM: WidgetItem = { ...ITEM, metadata: { nerdFont: 'true' } };

        it('renders the unlock glyph when OFF', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: false });
            expect(new SandboxStatusWidget().render(NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe(`SB: ${UNLOCK}`);
        });

        it('renders the lock glyph when ON', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: true });
            expect(new SandboxStatusWidget().render(NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe(`SB: ${LOCK}`);
        });
    });

    describe('render() - format text', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'text' } };

        it('renders SB: OFF when OFF', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: false });
            expect(new SandboxStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('SB: OFF');
        });

        it('renders SB: ON when ON', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: true });
            expect(new SandboxStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('SB: ON');
        });
    });

    describe('render() - format word', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'word' } };

        it('renders Sandbox: OFF when OFF', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: false });
            expect(new SandboxStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('Sandbox: OFF');
        });

        it('renders Sandbox: ON when ON', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: true });
            expect(new SandboxStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('Sandbox: ON');
        });
    });

    describe('render() - format bare (glyph only)', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'bare' } };
        const FORMAT_NERD_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'bare', nerdFont: 'true' } };

        it('renders ○ when OFF', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: false });
            expect(new SandboxStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('○');
        });

        it('renders ● when ON', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: true });
            expect(new SandboxStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('●');
        });

        it('renders only the configured Nerd Font glyph', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValueOnce({ enabled: false });
            expect(new SandboxStatusWidget().render(FORMAT_NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe(UNLOCK);

            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValueOnce({ enabled: true });
            expect(new SandboxStatusWidget().render(FORMAT_NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe(LOCK);
        });
    });

    describe('render() - sandbox config cwd', () => {
        it('uses the project dir for project-local Claude settings', () => {
            const context = makeContext({
                data: {
                    cwd: '/repo/subdir',
                    workspace: {
                        current_dir: '/repo/current-dir',
                        project_dir: '/repo'
                    }
                }
            });

            new SandboxStatusWidget().render(ITEM, context, DEFAULT_SETTINGS);

            expect(claudeSettings.getSandboxConfig).toHaveBeenCalledWith('/repo');
        });

        it('falls back to cwd when project dir is missing', () => {
            const context = makeContext({
                data: {
                    cwd: '/repo/subdir',
                    workspace: { current_dir: '/repo/current-dir' }
                }
            });

            new SandboxStatusWidget().render(ITEM, context, DEFAULT_SETTINGS);

            expect(claudeSettings.getSandboxConfig).toHaveBeenCalledWith('/repo/subdir');
        });

        it('falls back to workspace.current_dir when project dir and cwd are missing', () => {
            const context = makeContext({ data: { workspace: { current_dir: '/repo/current-dir' } } });

            new SandboxStatusWidget().render(ITEM, context, DEFAULT_SETTINGS);

            expect(claudeSettings.getSandboxConfig).toHaveBeenCalledWith('/repo/current-dir');
        });
    });

    describe('render() - preview mode', () => {
        it('renders the ON state for the default format', () => {
            expect(new SandboxStatusWidget().render(ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('SB: ●');
        });
    });

    describe('render() - missing config', () => {
        it('returns null when getSandboxConfig returns null', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue(null);
            expect(new SandboxStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });
    });

    describe('render() - raw value', () => {
        const RAW_ITEM: WidgetItem = { ...ITEM, rawValue: true };

        it('returns "on" when ON', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: true });
            expect(new SandboxStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('on');
        });

        it('returns "off" when OFF', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue({ enabled: false });
            expect(new SandboxStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('off');
        });

        it('returns the semantic value regardless of format and Nerd Font settings', () => {
            const rawNerdItem: WidgetItem = {
                ...RAW_ITEM,
                metadata: { format: 'glyph', nerdFont: 'true' }
            };

            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValueOnce({ enabled: false });
            expect(new SandboxStatusWidget().render(rawNerdItem, makeContext(), DEFAULT_SETTINGS)).toBe('off');

            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValueOnce({ enabled: true });
            expect(new SandboxStatusWidget().render(rawNerdItem, makeContext(), DEFAULT_SETTINGS)).toBe('on');
        });

        it('returns "on" in preview mode', () => {
            expect(new SandboxStatusWidget().render(RAW_ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('on');
        });

        it('returns null when config is null', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue(null);
            expect(new SandboxStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });
    });
});
