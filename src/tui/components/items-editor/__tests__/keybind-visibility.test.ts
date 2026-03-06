import {
    describe,
    expect,
    it
} from 'vitest';

import type {
    CustomKeybind,
    WidgetItem
} from '../../../../types/Widget';
import { shouldShowCustomKeybind } from '../keybind-visibility';

const TOGGLE_COMPACT_KEYBIND: CustomKeybind = { key: 's', label: '(s)hort time', action: 'toggle-compact' };
const TOGGLE_INVERT_KEYBIND: CustomKeybind = { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' };
const EDIT_LIST_LIMIT_KEYBIND: CustomKeybind = { key: 'l', label: '(l)imit list', action: 'edit-list-limit' };

function createWidget(type: string, metadata?: Record<string, string>): WidgetItem {
    return {
        id: 'widget',
        type,
        metadata
    };
}

describe('shouldShowCustomKeybind', () => {
    it('shows invert only in progress modes', () => {
        expect(shouldShowCustomKeybind(createWidget('block-timer'), TOGGLE_INVERT_KEYBIND)).toBe(false);
        expect(shouldShowCustomKeybind(createWidget('block-timer', { display: 'progress' }), TOGGLE_INVERT_KEYBIND)).toBe(true);
        expect(shouldShowCustomKeybind(createWidget('block-timer', { display: 'progress-short' }), TOGGLE_INVERT_KEYBIND)).toBe(true);
    });

    it('hides short time in progress modes', () => {
        expect(shouldShowCustomKeybind(createWidget('block-timer'), TOGGLE_COMPACT_KEYBIND)).toBe(true);
        expect(shouldShowCustomKeybind(createWidget('block-timer', { display: 'time' }), TOGGLE_COMPACT_KEYBIND)).toBe(true);
        expect(shouldShowCustomKeybind(createWidget('block-timer', { display: 'progress' }), TOGGLE_COMPACT_KEYBIND)).toBe(false);
        expect(shouldShowCustomKeybind(createWidget('block-timer', { display: 'progress-short' }), TOGGLE_COMPACT_KEYBIND)).toBe(false);
    });

    it('shows list limit only for skills list mode', () => {
        expect(shouldShowCustomKeybind(createWidget('skills'), EDIT_LIST_LIMIT_KEYBIND)).toBe(false);
        expect(shouldShowCustomKeybind(createWidget('skills', { mode: 'count' }), EDIT_LIST_LIMIT_KEYBIND)).toBe(false);
        expect(shouldShowCustomKeybind(createWidget('skills', { mode: 'list' }), EDIT_LIST_LIMIT_KEYBIND)).toBe(true);
    });
});