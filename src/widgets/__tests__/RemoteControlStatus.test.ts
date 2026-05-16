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
import { RemoteControlStatusWidget } from '../RemoteControlStatus';

const ITEM: WidgetItem = { id: 'remote-control-status', type: 'remote-control-status' };
const SESSION_ID = 'session-abc-123';

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
    return { data: { session_id: SESSION_ID }, ...overrides };
}

beforeEach(() => {
    vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('RemoteControlStatusWidget', () => {
    describe('metadata', () => {
        it('has correct display name', () => {
            expect(new RemoteControlStatusWidget().getDisplayName()).toBe('Remote Control Status');
        });

        it('has correct description', () => {
            expect(new RemoteControlStatusWidget().getDescription())
                .toBe('Shows whether Claude Code remote control is attached to the current session');
        });

        it('has correct category', () => {
            expect(new RemoteControlStatusWidget().getCategory()).toBe('Core');
        });

        it('has blue default color', () => {
            expect(new RemoteControlStatusWidget().getDefaultColor()).toBe('blue');
        });

        it('supports raw value', () => {
            expect(new RemoteControlStatusWidget().supportsRawValue()).toBe(true);
        });

        it('supports colors', () => {
            expect(new RemoteControlStatusWidget().supportsColors(ITEM)).toBe(true);
        });
    });

    describe('editor configuration', () => {
        it('exposes f and n keybinds', () => {
            expect(new RemoteControlStatusWidget().getCustomKeybinds()).toEqual([
                { key: 'f', label: '(f)ormat', action: 'cycle-format' },
                { key: 'n', label: '(n)erd font', action: 'toggle-nerd-font' }
            ]);
        });

        it('defaults to icon in the editor display', () => {
            expect(new RemoteControlStatusWidget().getEditorDisplay(ITEM)).toEqual({
                displayText: 'Remote Control Status',
                modifierText: '(icon)'
            });
        });

        it('shows the configured format and nerd font in the editor display', () => {
            expect(new RemoteControlStatusWidget().getEditorDisplay({
                ...ITEM,
                metadata: { format: 'word', nerdFont: 'true' }
            })).toEqual({
                displayText: 'Remote Control Status',
                modifierText: '(word, nerd font)'
            });
        });

        it('cycles icon -> icon-text -> text -> word -> label-check -> label-mark -> icon', () => {
            const widget = new RemoteControlStatusWidget();
            const iconText = widget.handleEditorAction('cycle-format', ITEM);
            const text = widget.handleEditorAction('cycle-format', iconText ?? ITEM);
            const word = widget.handleEditorAction('cycle-format', text ?? ITEM);
            const labelCheck = widget.handleEditorAction('cycle-format', word ?? ITEM);
            const labelMark = widget.handleEditorAction('cycle-format', labelCheck ?? ITEM);
            const back = widget.handleEditorAction('cycle-format', labelMark ?? ITEM);

            expect(iconText?.metadata?.format).toBe('icon-text');
            expect(text?.metadata?.format).toBe('text');
            expect(word?.metadata?.format).toBe('word');
            expect(labelCheck?.metadata?.format).toBe('label-check');
            expect(labelMark?.metadata?.format).toBe('label-mark');
            expect(back?.metadata?.format).toBeUndefined();
        });

        it('toggles nerd font metadata on and off', () => {
            const widget = new RemoteControlStatusWidget();
            const enabled = widget.handleEditorAction('toggle-nerd-font', ITEM);
            const disabled = widget.handleEditorAction('toggle-nerd-font', enabled ?? ITEM);

            expect(enabled?.metadata?.nerdFont).toBe('true');
            expect(disabled?.metadata?.nerdFont).toBeUndefined();
        });

        it('returns null for unknown editor actions', () => {
            expect(new RemoteControlStatusWidget().handleEditorAction('unknown', ITEM)).toBeNull();
        });
    });

    describe('render() - format icon (default), standard glyphs', () => {
        it('renders 📡 ○ when OFF', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('📡 ○');
        });

        it('renders 📡 ◉ when ON', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: true });
            expect(new RemoteControlStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('📡 ◉');
        });
    });

    describe('render() - format icon, Nerd Font', () => {
        const NERD_ITEM: WidgetItem = { ...ITEM, metadata: { nerdFont: 'true' } };

        it('renders disconnected glyph (U+F6AC) when OFF', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('\uF6AC');
        });

        it('renders connected glyph (U+F1EB) when ON', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: true });
            expect(new RemoteControlStatusWidget().render(NERD_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('\uF1EB');
        });
    });

    describe('render() - format icon-text', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'icon-text' } };

        it('renders 📡 off when OFF', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('📡 off');
        });

        it('renders 📡 on when ON', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: true });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('📡 on');
        });
    });

    describe('render() - format text', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'text' } };

        it('renders "off" when OFF', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('off');
        });

        it('renders "on" when ON', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: true });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('on');
        });
    });

    describe('render() - format word', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'word' } };

        it('renders "remote off" when OFF', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('remote off');
        });

        it('renders "remote on" when ON', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: true });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('remote on');
        });
    });

    describe('render() - format label-check', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'label-check' } };

        it('renders "remote ❌" when OFF', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('remote ❌');
        });

        it('renders "remote ✅" when ON', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: true });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('remote ✅');
        });
    });

    describe('render() - format label-mark', () => {
        const FORMAT_ITEM: WidgetItem = { ...ITEM, metadata: { format: 'label-mark' } };

        it('renders "remote ✗" when OFF', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('remote ✗');
        });

        it('renders "remote ✓" when ON', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: true });
            expect(new RemoteControlStatusWidget().render(FORMAT_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('remote ✓');
        });
    });

    describe('render() - session id passthrough', () => {
        it('forwards the session id from the status JSON to the lookup helper', () => {
            new RemoteControlStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS);
            expect(claudeSettings.getRemoteControlStatus).toHaveBeenCalledWith(SESSION_ID);
        });

        it('passes undefined when no session id is present', () => {
            new RemoteControlStatusWidget().render(ITEM, { data: {} }, DEFAULT_SETTINGS);
            expect(claudeSettings.getRemoteControlStatus).toHaveBeenCalledWith(undefined);
        });
    });

    describe('render() - preview mode', () => {
        it('renders the ON state for the default format', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS))
                .toBe('📡 ◉');
        });

        it('renders the ON state for word format with nerd font', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            const item: WidgetItem = { ...ITEM, metadata: { format: 'word', nerdFont: 'true' } };
            expect(new RemoteControlStatusWidget().render(item, makeContext({ isPreview: true }), DEFAULT_SETTINGS))
                .toBe('remote on');
        });
    });

    describe('render() - missing manifest', () => {
        it('returns null when getRemoteControlStatus returns null', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue(null);
            expect(new RemoteControlStatusWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });
    });

    describe('render() - raw value', () => {
        const RAW_ITEM: WidgetItem = { ...ITEM, rawValue: true };

        it('returns "on" when ON', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: true });
            expect(new RemoteControlStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('on');
        });

        it('returns "off" when OFF', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue({ enabled: false });
            expect(new RemoteControlStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('off');
        });

        it('returns "on" in preview mode', () => {
            expect(new RemoteControlStatusWidget().render(RAW_ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS))
                .toBe('on');
        });

        it('returns null when manifest lookup is null', () => {
            vi.spyOn(claudeSettings, 'getRemoteControlStatus').mockReturnValue(null);
            expect(new RemoteControlStatusWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });
    });
});
