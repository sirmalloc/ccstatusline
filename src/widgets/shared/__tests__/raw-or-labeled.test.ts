import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    formatRawOrLabeledValue,
    getLabel,
    getLabelModifierText,
    setLabel
} from '../raw-or-labeled';

function makeItem(overrides: Partial<WidgetItem> = {}): WidgetItem {
    return { id: '1', type: 'model', ...overrides };
}

describe('formatRawOrLabeledValue', () => {
    it('prepends the default label', () => {
        expect(formatRawOrLabeledValue(makeItem(), 'Model: ', 'Opus')).toBe('Model: Opus');
    });

    it('prepends the label override verbatim', () => {
        expect(formatRawOrLabeledValue(makeItem({ metadata: { label: 'M ' } }), 'Model: ', 'Opus')).toBe('M Opus');
    });

    it('treats an empty override as no label', () => {
        expect(formatRawOrLabeledValue(makeItem({ metadata: { label: '' } }), 'Model: ', 'Opus')).toBe('Opus');
    });

    it('ignores the override in raw value mode', () => {
        expect(formatRawOrLabeledValue(makeItem({ rawValue: true, metadata: { label: 'M ' } }), 'Model: ', 'Opus')).toBe('Opus');
    });
});

describe('setLabel', () => {
    it('stores an override that differs from the default', () => {
        const item = setLabel(makeItem(), 'Model: ', 'M ');
        expect(item.metadata).toEqual({ label: 'M ' });
        expect(getLabel(item, 'Model: ')).toBe('M ');
    });

    it('keeps an empty override', () => {
        expect(setLabel(makeItem(), 'Model: ', '').metadata).toEqual({ label: '' });
    });

    it('drops the override when it matches the default, preserving other metadata', () => {
        const item = makeItem({ metadata: { label: 'M ', hide: 'zero' } });
        expect(setLabel(item, 'Model: ', 'Model: ').metadata).toEqual({ hide: 'zero' });
        expect(setLabel(makeItem({ metadata: { label: 'M ' } }), 'Model: ', 'Model: ').metadata).toBeUndefined();
    });
});

describe('getLabelModifierText', () => {
    it('quotes an override so trailing spaces are visible', () => {
        expect(getLabelModifierText(makeItem({ metadata: { label: 'M ' } }))).toBe('(label: "M ")');
        expect(getLabelModifierText(makeItem())).toBeUndefined();
    });
});
