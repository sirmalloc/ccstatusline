import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    HideableState,
    WidgetItem
} from '../../../types/Widget';
import {
    getEnabledHideStates,
    getHideKeybind,
    getHideModifierText,
    isHidden,
    parseHideStates,
    setEnabledHideStates
} from '../hideable';

const STATES: HideableState[] = [
    { key: 'no-git', label: 'when not in a git repo' },
    { key: 'zero', label: 'when count is zero' }
];

const STATES_WITH_DEFAULT: HideableState[] = [
    { key: 'no-git', label: 'when not in a git repo' },
    { key: 'zero', label: 'when not diverged', defaultEnabled: true }
];

function makeItem(metadata?: Record<string, string>): WidgetItem {
    return { id: 'item', type: 'git-branch', metadata };
}

describe('parseHideStates', () => {
    it('returns an empty list for undefined', () => {
        expect(parseHideStates(undefined)).toEqual([]);
    });

    it('returns an empty list for an empty string', () => {
        expect(parseHideStates('')).toEqual([]);
    });

    it('splits comma-separated keys and trims whitespace', () => {
        expect(parseHideStates('no-git, zero ,empty')).toEqual(['no-git', 'zero', 'empty']);
    });
});

describe('isHidden', () => {
    it('returns false when no hide metadata exists', () => {
        expect(isHidden(makeItem(), 'no-git')).toBe(false);
    });

    it('returns true for keys in the hide list', () => {
        const item = makeItem({ hide: 'no-git,zero' });
        expect(isHidden(item, 'no-git')).toBe(true);
        expect(isHidden(item, 'zero')).toBe(true);
        expect(isHidden(item, 'empty')).toBe(false);
    });

    it('applies the default when the hide key is absent', () => {
        expect(isHidden(makeItem(), 'zero', true)).toBe(true);
        expect(isHidden(makeItem(), 'zero', false)).toBe(false);
    });

    it('treats a present hide list as authoritative over defaults', () => {
        expect(isHidden(makeItem({ hide: '' }), 'zero', true)).toBe(false);
        expect(isHidden(makeItem({ hide: 'no-git' }), 'zero', true)).toBe(false);
    });
});

describe('getEnabledHideStates', () => {
    it('returns enabled keys in declaration order', () => {
        const item = makeItem({ hide: 'zero,no-git' });
        expect(getEnabledHideStates(item, STATES)).toEqual(['no-git', 'zero']);
    });

    it('includes default-enabled states when hide metadata is absent', () => {
        expect(getEnabledHideStates(makeItem(), STATES_WITH_DEFAULT)).toEqual(['zero']);
    });
});

describe('setEnabledHideStates', () => {
    it('writes the enabled keys as a comma-separated list', () => {
        const updated = setEnabledHideStates(makeItem(), STATES, ['zero', 'no-git']);
        expect(updated.metadata?.hide).toBe('no-git,zero');
    });

    it('replaces an existing hide list while preserving other metadata', () => {
        const item = makeItem({
            hide: 'zero',
            mode: 'list'
        });
        const updated = setEnabledHideStates(item, STATES, ['no-git']);

        expect(updated.metadata).toEqual({ hide: 'no-git', mode: 'list' });
    });

    it('omits the hide key when the enabled set matches the defaults', () => {
        const allOff = setEnabledHideStates(makeItem({ hide: 'no-git' }), STATES, []);
        expect(allOff.metadata).toBeUndefined();

        const defaultOn = setEnabledHideStates(makeItem({ hide: '' }), STATES_WITH_DEFAULT, ['zero']);
        expect(defaultOn.metadata).toBeUndefined();
    });

    it('writes an empty hide list to opt out of default-enabled states', () => {
        const updated = setEnabledHideStates(makeItem(), STATES_WITH_DEFAULT, []);
        expect(updated.metadata?.hide).toBe('');
    });

    it('ignores enabled keys that are not declared by the widget', () => {
        const updated = setEnabledHideStates(makeItem(), STATES, ['no-git', 'bogus']);
        expect(updated.metadata?.hide).toBe('no-git');
    });
});

describe('editor helpers', () => {
    it('uses h for the shared hide keybind', () => {
        expect(getHideKeybind()).toEqual({ key: 'h', label: '(h)ide…', action: 'edit-hide-states' });
    });

    it('formats the hide modifier text from enabled state keys', () => {
        expect(getHideModifierText(makeItem({ hide: 'no-git,zero' }), STATES)).toBe('(hide: no-git, zero)');
        expect(getHideModifierText(makeItem(), STATES)).toBeUndefined();
    });
});
