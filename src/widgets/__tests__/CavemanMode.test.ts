import {
    afterEach,
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
import * as caveman from '../../utils/caveman';
import { CavemanModeWidget } from '../CavemanMode';

const ITEM: WidgetItem = { id: 'caveman-mode', type: 'caveman-mode' };
const HIDDEN_SAVINGS_ITEM: WidgetItem = { ...ITEM, metadata: { hideSavings: 'true' } };

function makeContext(overrides: Partial<RenderContext> = {}): RenderContext {
    return { ...overrides };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('CavemanModeWidget', () => {
    describe('metadata', () => {
        it('has correct display name', () => {
            expect(new CavemanModeWidget().getDisplayName()).toBe('Caveman Mode');
        });

        it('has correct description', () => {
            expect(new CavemanModeWidget().getDescription()).toBe('Shows the active caveman compression mode badge and token savings');
        });

        it('has correct category', () => {
            expect(new CavemanModeWidget().getCategory()).toBe('Core');
        });

        it('has yellow default color', () => {
            expect(new CavemanModeWidget().getDefaultColor()).toBe('yellow');
        });

        it('supports raw value', () => {
            expect(new CavemanModeWidget().supportsRawValue()).toBe(true);
        });

        it('supports colors', () => {
            expect(new CavemanModeWidget().supportsColors(ITEM)).toBe(true);
        });
    });

    describe('editor configuration', () => {
        it('exposes s keybind', () => {
            expect(new CavemanModeWidget().getCustomKeybinds()).toEqual([
                { key: 's', label: '(s)avings', action: 'toggle-savings' }
            ]);
        });

        it('defaults to showing savings in the editor display', () => {
            expect(new CavemanModeWidget().getEditorDisplay(ITEM)).toEqual({
                displayText: 'Caveman Mode',
                modifierText: '(savings)'
            });
        });

        it('shows no savings in the editor display when hidden', () => {
            expect(new CavemanModeWidget().getEditorDisplay(HIDDEN_SAVINGS_ITEM)).toEqual({
                displayText: 'Caveman Mode',
                modifierText: '(no savings)'
            });
        });

        it('toggles hideSavings metadata on and off', () => {
            const widget = new CavemanModeWidget();
            const hidden = widget.handleEditorAction('toggle-savings', ITEM);
            const shown = widget.handleEditorAction('toggle-savings', hidden ?? ITEM);

            expect(hidden?.metadata?.hideSavings).toBe('true');
            expect(shown?.metadata?.hideSavings).toBeUndefined();
        });

        it('returns null for unknown editor actions', () => {
            expect(new CavemanModeWidget().handleEditorAction('unknown', ITEM)).toBeNull();
        });
    });

    describe('render() - hide on absent status', () => {
        it('returns null when getCavemanStatus returns null', () => {
            vi.spyOn(caveman, 'getCavemanStatus').mockReturnValue(null);
            expect(new CavemanModeWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });
    });

    describe('render() - badge formatting', () => {
        it('renders [CAVEMAN] for full mode', () => {
            vi.spyOn(caveman, 'getCavemanStatus').mockReturnValue({ mode: 'full', savings: null });
            expect(new CavemanModeWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('[CAVEMAN]');
        });

        it('renders [CAVEMAN:ULTRA] for ultra mode', () => {
            vi.spyOn(caveman, 'getCavemanStatus').mockReturnValue({ mode: 'ultra', savings: null });
            expect(new CavemanModeWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('[CAVEMAN:ULTRA]');
        });
    });

    describe('render() - savings toggle', () => {
        it('appends savings when shown (default) and present', () => {
            vi.spyOn(caveman, 'getCavemanStatus').mockReturnValue({ mode: 'ultra', savings: '⛏  12.4k' });
            expect(new CavemanModeWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('[CAVEMAN:ULTRA] ⛏  12.4k');
        });

        it('omits savings when null even if shown', () => {
            vi.spyOn(caveman, 'getCavemanStatus').mockReturnValue({ mode: 'ultra', savings: null });
            expect(new CavemanModeWidget().render(ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('[CAVEMAN:ULTRA]');
        });

        it('omits savings when hidden via metadata', () => {
            vi.spyOn(caveman, 'getCavemanStatus').mockReturnValue({ mode: 'ultra', savings: '⛏  12.4k' });
            expect(new CavemanModeWidget().render(HIDDEN_SAVINGS_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('[CAVEMAN:ULTRA]');
        });
    });

    describe('render() - raw value', () => {
        const RAW_ITEM: WidgetItem = { ...ITEM, rawValue: true };

        it('returns the bare mode word', () => {
            vi.spyOn(caveman, 'getCavemanStatus').mockReturnValue({ mode: 'ultra', savings: '⛏  12.4k' });
            expect(new CavemanModeWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBe('ultra');
        });

        it('returns null when status is null', () => {
            vi.spyOn(caveman, 'getCavemanStatus').mockReturnValue(null);
            expect(new CavemanModeWidget().render(RAW_ITEM, makeContext(), DEFAULT_SETTINGS)).toBeNull();
        });

        it('returns "full" in preview mode', () => {
            expect(new CavemanModeWidget().render(RAW_ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('full');
        });
    });

    describe('render() - preview mode', () => {
        it('renders the badge with savings by default and never calls the helper', () => {
            const spy = vi.spyOn(caveman, 'getCavemanStatus');
            expect(new CavemanModeWidget().render(ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('[CAVEMAN] ⛏  12.4k');
            expect(spy).not.toHaveBeenCalled();
        });

        it('renders the badge without savings when hidden via metadata', () => {
            const spy = vi.spyOn(caveman, 'getCavemanStatus');
            expect(new CavemanModeWidget().render(HIDDEN_SAVINGS_ITEM, makeContext({ isPreview: true }), DEFAULT_SETTINGS)).toBe('[CAVEMAN]');
            expect(spy).not.toHaveBeenCalled();
        });
    });
});
