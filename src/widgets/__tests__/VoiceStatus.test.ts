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
import { VoiceStatusWidget } from '../VoiceStatus';

const ITEM: WidgetItem = { id: 'voice-status', type: 'voice-status' };

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
    return { ...overrides };
}

beforeEach(() => {
    vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('VoiceStatusWidget', () => {
    describe('metadata', () => {
        it('has correct display name', () => {
            expect(new VoiceStatusWidget().getDisplayName()).toBe('Voice Status');
        });

        it('has correct description', () => {
            expect(new VoiceStatusWidget().getDescription()).toBe('Shows whether Claude Code voice input is enabled');
        });

        it('has correct category', () => {
            expect(new VoiceStatusWidget().getCategory()).toBe('Core');
        });

        it('has magenta default color', () => {
            expect(new VoiceStatusWidget().getDefaultColor()).toBe('magenta');
        });

        it('supports raw value', () => {
            expect(new VoiceStatusWidget().supportsRawValue()).toBe(true);
        });

        it('supports colors', () => {
            expect(new VoiceStatusWidget().supportsColors(ITEM)).toBe(true);
        });
    });

    describe('editor configuration', () => {
        it('exposes f and n keybinds', () => {
            expect(new VoiceStatusWidget().getCustomKeybinds()).toEqual([
                { key: 'f', label: '(f)ormat', action: 'cycle-format' },
                { key: 'n', label: '(n)erd font', action: 'toggle-nerd-font' }
            ]);
        });

        it('defaults to icon in the editor display', () => {
            expect(new VoiceStatusWidget().getEditorDisplay(ITEM)).toEqual({
                displayText: 'Voice Status',
                modifierText: '(icon)'
            });
        });

        it('shows the configured format and nerd font in the editor display', () => {
            expect(new VoiceStatusWidget().getEditorDisplay({
                ...ITEM,
                metadata: { format: 'word', nerdFont: 'true' }
            })).toEqual({
                displayText: 'Voice Status',
                modifierText: '(word, nerd font)'
            });
        });

        it('cycles icon -> icon-text -> text -> word -> icon', () => {
            const widget = new VoiceStatusWidget();
            const iconText = widget.handleEditorAction('cycle-format', ITEM);
            const text = widget.handleEditorAction('cycle-format', iconText ?? ITEM);
            const word = widget.handleEditorAction('cycle-format', text ?? ITEM);
            const back = widget.handleEditorAction('cycle-format', word ?? ITEM);

            expect(iconText?.metadata?.format).toBe('icon-text');
            expect(text?.metadata?.format).toBe('text');
            expect(word?.metadata?.format).toBe('word');
            expect(back?.metadata?.format).toBeUndefined();
        });

        it('toggles nerd font metadata on and off', () => {
            const widget = new VoiceStatusWidget();
            const enabled = widget.handleEditorAction('toggle-nerd-font', ITEM);
            const disabled = widget.handleEditorAction('toggle-nerd-font', enabled ?? ITEM);

            expect(enabled?.metadata?.nerdFont).toBe('true');
            expect(disabled?.metadata?.nerdFont).toBeUndefined();
        });

        it('returns null for unknown editor actions', () => {
            expect(new VoiceStatusWidget().handleEditorAction('unknown', ITEM)).toBeNull();
        });
    });

    describe('render() - format icon (default), standard glyphs', () => {
        it('renders 🎤 ○ when OFF', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            expect(new VoiceStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('🎤 ○');
        });

        it('renders 🎤 ◉ when ON', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: true });
            expect(new VoiceStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('🎤 ◉');
        });
    });

    describe('render() - format icon, Nerd Font', () => {
        const NERD_ITEM: WidgetItem = { ...ITEM, metadata: { nerdFont: 'true' } };

        it('renders mic-slash glyph (U+F131) when OFF', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            expect(new VoiceStatusWidget().render(NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('');
        });

        it('renders mic glyph (U+F130) when ON', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: true });
            expect(new VoiceStatusWidget().render(NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('');
        });
    });

    describe('render() - format icon-text', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'icon-text' } };
        const FORMAT_NERD_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'icon-text', nerdFont: 'true' } };

        it('renders 🎤 off when OFF (standard)', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            expect(new VoiceStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('🎤 off');
        });

        it('renders 🎤 on when ON (standard)', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: true });
            expect(new VoiceStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('🎤 on');
        });

        it('renders mic-slash off when OFF (nerd font)', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            expect(new VoiceStatusWidget().render(FORMAT_NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe(' off');
        });

        it('renders mic on when ON (nerd font)', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: true });
            expect(new VoiceStatusWidget().render(FORMAT_NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe(' on');
        });
    });

    describe('render() - format text', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'text' } };

        it('renders "off" when OFF', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            expect(new VoiceStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('off');
        });

        it('renders "on" when ON', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: true });
            expect(new VoiceStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('on');
        });
    });

    describe('render() - format word', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'word' } };

        it('renders "voice off" when OFF', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            expect(new VoiceStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('voice off');
        });

        it('renders "voice on" when ON', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: true });
            expect(new VoiceStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('voice on');
        });
    });

    describe('render() - preview mode', () => {
        it('renders the ON state for the default format', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            expect(new VoiceStatusWidget().render(ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('🎤 ◉');
        });

        it('renders the ON state for word format with nerd font', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            const item: WidgetItem = { ...ITEM, metadata: { format: 'word', nerdFont: 'true' } };
            expect(new VoiceStatusWidget().render(item, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('voice on');
        });
    });

    describe('render() - missing config', () => {
        it('returns null when getVoiceConfig returns null', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue(null);
            expect(new VoiceStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });
    });

    describe('render() - raw value', () => {
        const RAW_ITEM: WidgetItem = { ...ITEM, rawValue: true };

        it('returns "on" when ON', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: true });
            expect(new VoiceStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('on');
        });

        it('returns "off" when OFF', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue({ enabled: false });
            expect(new VoiceStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('off');
        });

        it('returns "on" in preview mode', () => {
            expect(new VoiceStatusWidget().render(RAW_ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('on');
        });

        it('returns null when config is null', () => {
            vi.spyOn(claudeSettings, 'getVoiceConfig').mockReturnValue(null);
            expect(new VoiceStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });
    });
});
