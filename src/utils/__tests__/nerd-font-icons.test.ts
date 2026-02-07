import {
    describe,
    expect,
    it
} from 'vitest';

import {
    NERD_FONT_ICONS,
    formatWidgetLabel
} from '../nerd-font-icons';

describe('formatWidgetLabel', () => {
    it('should return just the value when rawValue is true', () => {
        expect(formatWidgetLabel('model', 'Claude', 'Model: ', true, false)).toBe('Claude');
    });

    it('should return textLabel + value when nerdFontIcons is false', () => {
        expect(formatWidgetLabel('model', 'Claude', 'Model: ', false, false)).toBe('Model: Claude');
    });

    it('should return icon + space + value when nerdFontIcons is true', () => {
        const result = formatWidgetLabel('model', 'Claude', 'Model: ', false, true);
        const expectedIcon = NERD_FONT_ICONS.model;
        expect(result).toBe(`${expectedIcon} Claude`);
    });

    it('should fall back to textLabel when widget type has no icon mapping', () => {
        const result = formatWidgetLabel('unknown-type', 'value', 'Label: ', false, true);
        expect(result).toBe('Label: value');
    });

    it('should return undefined for unknown widget types', () => {
        const { getNerdFontIcon } = require('../nerd-font-icons');
        expect(getNerdFontIcon('unknown-widget')).toBeUndefined();
    });
});
