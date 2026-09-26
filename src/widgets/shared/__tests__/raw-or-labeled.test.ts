import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import {
    formatRawOrLabeledValue,
    getCompactLabelKeybind,
    getCompactLabelModifierText,
    startsWithCompactLabel,
    toggleCompactLabel,
    withGlobalCompactLabels
} from '../raw-or-labeled';

const ITEM: WidgetItem = { id: '1', type: 'model' };

describe('formatRawOrLabeledValue', () => {
    it('keeps the default label when compact labels are off', () => {
        expect(formatRawOrLabeledValue(ITEM, 'Model: ', 'Opus')).toBe('Model: Opus');
    });

    it('uses the compact preset when the item opts in', () => {
        expect(formatRawOrLabeledValue(toggleCompactLabel(ITEM), 'Model: ', 'Opus')).toBe('M: Opus');
    });

    it('maps Context to Ctx and Cost to the $ glyph', () => {
        const compact = toggleCompactLabel(ITEM);
        expect(formatRawOrLabeledValue(compact, 'Context: ', '[====] 25%')).toBe('Ctx: [====] 25%');
        expect(formatRawOrLabeledValue(compact, 'Cost: ', '$2.45')).toBe('$2.45');
    });

    it('keeps labels without a preset unchanged in compact mode', () => {
        expect(formatRawOrLabeledValue(toggleCompactLabel(ITEM), 'In: ', '15.2k')).toBe('In: 15.2k');
    });

    it('rawValue wins over compact labels', () => {
        expect(formatRawOrLabeledValue({ ...ITEM, rawValue: true, metadata: { compactLabel: 'true' } }, 'Model: ', 'Opus')).toBe('Opus');
    });
});

describe('toggleCompactLabel', () => {
    it('cycles inherit -> on -> forced off -> inherit without the global setting', () => {
        const on = toggleCompactLabel(ITEM);
        expect(on.metadata).toEqual({ compactLabel: 'true' });

        const forcedOff = toggleCompactLabel(on);
        expect(forcedOff.metadata).toEqual({ compactLabel: 'false' });

        const inherit = toggleCompactLabel(forcedOff);
        expect(inherit.metadata).toBeUndefined();
        expect(inherit).toEqual(ITEM);
    });

    it('starts from the effective state while the global setting is on', () => {
        const settings = { ...DEFAULT_SETTINGS, compactLabels: true };
        // Inherited compact -> first press forces off instead of a no-op.
        const forcedOff = toggleCompactLabel(ITEM, settings);
        expect(forcedOff.metadata).toEqual({ compactLabel: 'false' });

        // Second press drops the key and inherits the global setting again.
        expect(toggleCompactLabel(forcedOff, settings).metadata).toBeUndefined();
    });

    it('preserves sibling metadata', () => {
        const item: WidgetItem = { id: '1', type: 'model', metadata: { hide: 'no-git' } };
        expect(toggleCompactLabel(item).metadata).toEqual({ hide: 'no-git', compactLabel: 'true' });
        expect(toggleCompactLabel(toggleCompactLabel(toggleCompactLabel(item))).metadata).toEqual({ hide: 'no-git' });
    });
});

describe('withGlobalCompactLabels', () => {
    it('is a no-op when the global setting is off', () => {
        expect(withGlobalCompactLabels(ITEM, DEFAULT_SETTINGS)).toBe(ITEM);
    });

    it('injects the compact flag when the global setting is on', () => {
        const settings = { ...DEFAULT_SETTINGS, compactLabels: true };
        expect(withGlobalCompactLabels(ITEM, settings).metadata).toEqual({ compactLabel: 'true' });
    });

    it('lets an explicit per-widget choice win over the global setting', () => {
        const settings = { ...DEFAULT_SETTINGS, compactLabels: true };
        const optedOut: WidgetItem = { id: '1', type: 'model', metadata: { compactLabel: 'false' } };
        expect(withGlobalCompactLabels(optedOut, settings)).toBe(optedOut);
    });

    it('does not touch raw-value items', () => {
        const settings = { ...DEFAULT_SETTINGS, compactLabels: true };
        const raw: WidgetItem = { ...ITEM, rawValue: true };
        expect(withGlobalCompactLabels(raw, settings)).toBe(raw);
    });
});

describe('startsWithCompactLabel', () => {
    it('matches labels that have presets and rejects the rest', () => {
        expect(startsWithCompactLabel('Model: Opus')).toBe(true);
        expect(startsWithCompactLabel('Context: [bar]')).toBe(true);
        expect(startsWithCompactLabel('Cost: $1')).toBe(true);
        expect(startsWithCompactLabel('In: 15k')).toBe(false);
        expect(startsWithCompactLabel('')).toBe(false);
    });
});

describe('compact label keybind', () => {
    it('uses a key no widget binds and reports the effective state', () => {
        expect(getCompactLabelKeybind().key).toBe('j');
        const settings = { ...DEFAULT_SETTINGS, compactLabels: true };

        expect(getCompactLabelModifierText(ITEM)).toBeUndefined();
        expect(getCompactLabelModifierText(ITEM, settings)).toBe('(compact label: on)');
        expect(getCompactLabelModifierText(toggleCompactLabel(ITEM))).toBe('(compact label)');
        expect(getCompactLabelModifierText(toggleCompactLabel(toggleCompactLabel(ITEM)), settings)).toBe('(compact label: off)');
    });
});
