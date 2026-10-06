import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../../types/Widget';
import {
    CYCLE_FORMAT_ACTION,
    TOGGLE_NERD_FONT_ACTION,
    getFormat,
    getFormatKeybinds,
    getFormatModifierText,
    handleFormatAction,
    type FormatOptions
} from '../format-options';

type TestFormat = 'icon' | 'text' | 'word';
const options: FormatOptions<TestFormat> = {
    formats: ['icon', 'text', 'word'],
    defaultFormat: 'icon',
    canUseNerdFont: item => getFormat(item, options) === 'icon'
};
const item = (metadata?: Record<string, string>): WidgetItem => ({ id: 'w', type: 'voice-status', metadata });

describe('format options', () => {
    it('reads the format, falling back to the default', () => {
        expect(getFormat(item(), options)).toBe('icon');
        expect(getFormat(item({ format: 'word' }), options)).toBe('word');
        expect(getFormat(item({ format: 'bogus' }), options)).toBe('icon');
    });

    it('cycles the format with (f), wrapping around', () => {
        const cycled = [item()];
        for (let press = 0; press < 3; press++) {
            const next = handleFormatAction(CYCLE_FORMAT_ACTION, cycled.at(-1) ?? item(), options);
            if (next) {
                cycled.push(next);
            }
        }
        expect(cycled.map(state => getFormat(state, options))).toEqual(['icon', 'text', 'word', 'icon']);
    });

    it('toggles the Nerd Font icon with (n) and drops it on formats without an icon', () => {
        const nerdFont = handleFormatAction(TOGGLE_NERD_FONT_ACTION, item(), options);
        expect(getFormatModifierText(nerdFont ?? item(), options)).toBe('(icon, nerd font)');
        const text = handleFormatAction(CYCLE_FORMAT_ACTION, nerdFont ?? item(), options);
        expect(getFormatModifierText(text ?? item(), options)).toBe('(text)');
    });

    it('ignores other actions', () => {
        expect(handleFormatAction('toggle-something-else', item(), options)).toBeNull();
    });

    it('offers (n) only where the format can use a Nerd Font icon', () => {
        expect(getFormatKeybinds(item(), options).map(keybind => keybind.key)).toEqual(['f', 'n']);
        expect(getFormatKeybinds(item({ format: 'text' }), options).map(keybind => keybind.key)).toEqual(['f']);
        expect(getFormatKeybinds(undefined, options).map(keybind => keybind.key)).toEqual(['f', 'n']);
    });
});
