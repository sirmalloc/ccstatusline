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

        it('exposes the Nerd Font keybind only for glyph format', () => {
            const widget = new SandboxStatusWidget();
            const nerdFontKeybind = { key: 'n', label: '(n)erd font', action: 'toggle-nerd-font' };

            expect(widget.getCustomKeybinds(ITEM)).toContainEqual(nerdFontKeybind);
            expect(widget.getCustomKeybinds({ ...ITEM, rawValue: true })).toContainEqual(nerdFontKeybind);
            expect(widget.getCustomKeybinds({ ...ITEM, metadata: { format: 'text' } }))
                .not.toContainEqual(nerdFontKeybind);
            expect(widget.getCustomKeybinds({ ...ITEM, metadata: { format: 'word' } }))
                .not.toContainEqual(nerdFontKeybind);
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
                metadata: { nerdFont: 'true' }
            })).toEqual({
                displayText: 'Sandbox Status',
                modifierText: '(glyph, nerd font)'
            });
        });

        it('hides stale Nerd Font metadata in text-only editor displays', () => {
            expect(new SandboxStatusWidget().getEditorDisplay({
                ...ITEM,
                metadata: { format: 'word', nerdFont: 'true' }
            })).toEqual({
                displayText: 'Sandbox Status',
                modifierText: '(word)'
            });
        });

        it('cycles glyph -> text -> word -> glyph', () => {
            const widget = new SandboxStatusWidget();
            const text = widget.handleEditorAction('cycle-format', ITEM);
            const word = widget.handleEditorAction('cycle-format', text ?? ITEM);
            const back = widget.handleEditorAction('cycle-format', word ?? ITEM);

            expect(text?.metadata?.format).toBe('text');
            expect(word?.metadata?.format).toBe('word');
            expect(back?.metadata?.format).toBeUndefined();
        });

        it('clears Nerd Font metadata when cycling to text format', () => {
            const item: WidgetItem = { ...ITEM, metadata: { nerdFont: 'true' } };
            const text = new SandboxStatusWidget().handleEditorAction('cycle-format', item);

            expect(text?.metadata).toEqual({ format: 'text' });
        });

        it('toggles nerd font metadata on and off', () => {
            const widget = new SandboxStatusWidget();
            const enabled = widget.handleEditorAction('toggle-nerd-font', ITEM);
            const disabled = widget.handleEditorAction('toggle-nerd-font', enabled ?? ITEM);

            expect(enabled?.metadata?.nerdFont).toBe('true');
            expect(disabled?.metadata?.nerdFont).toBeUndefined();
        });

        it('does not toggle Nerd Font in text-only formats', () => {
            const widget = new SandboxStatusWidget();
            const textItem: WidgetItem = { ...ITEM, metadata: { format: 'text' } };
            const staleWordItem: WidgetItem = {
                ...ITEM,
                metadata: { format: 'word', nerdFont: 'true' }
            };

            expect(widget.handleEditorAction('toggle-nerd-font', textItem)?.metadata)
                .toEqual({ format: 'text' });
            expect(widget.handleEditorAction('toggle-nerd-font', staleWordItem)?.metadata)
                .toEqual({ format: 'word' });
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
        const cases: { name: string; item: WidgetItem; off: string; on: string }[] = [
            { name: 'glyph', item: RAW_ITEM, off: '○', on: '●' },
            {
                name: 'glyph with Nerd Font',
                item: { ...RAW_ITEM, metadata: { nerdFont: 'true' } },
                off: UNLOCK,
                on: LOCK
            },
            {
                name: 'text',
                item: { ...RAW_ITEM, metadata: { format: 'text' } },
                off: 'OFF',
                on: 'ON'
            },
            {
                name: 'word',
                item: { ...RAW_ITEM, metadata: { format: 'word' } },
                off: 'OFF',
                on: 'ON'
            }
        ];

        it.each(cases)('removes only the label from $name format', ({ item, off, on }) => {
            const configSpy = vi.spyOn(claudeSettings, 'getSandboxConfig');

            configSpy.mockReturnValue({ enabled: false });
            expect(new SandboxStatusWidget().render(item, makeContext(), DEFAULT_SETTINGS)).toBe(off);

            configSpy.mockReturnValue({ enabled: true });
            expect(new SandboxStatusWidget().render(item, makeContext(), DEFAULT_SETTINGS)).toBe(on);
        });

        it('preserves the default glyph format in preview mode', () => {
            expect(new SandboxStatusWidget().render(RAW_ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('●');
        });

        it('returns null when config is null', () => {
            vi.spyOn(claudeSettings, 'getSandboxConfig').mockReturnValue(null);
            expect(new SandboxStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });
    });
});
