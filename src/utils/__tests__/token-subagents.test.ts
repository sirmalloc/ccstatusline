import {
    describe,
    expect,
    it
} from 'vitest';

import type { WidgetItem } from '../../types/Widget';
import {
    SUBAGENTS_MARKER,
    isWidgetSubagentsEnabled,
    withWidgetSubagentsEnabled
} from '../token-subagents';

function makeItem(metadata?: Record<string, string>): WidgetItem {
    return { id: '1', type: 'tokens-input', metadata };
}

describe('token-subagents helper', () => {
    it('defaults to disabled', () => {
        expect(isWidgetSubagentsEnabled(makeItem())).toBe(false);
        expect(isWidgetSubagentsEnabled(makeItem({}))).toBe(false);
    });

    it('reads the includeSubagents flag', () => {
        expect(isWidgetSubagentsEnabled(makeItem({ includeSubagents: 'true' }))).toBe(true);
        expect(isWidgetSubagentsEnabled(makeItem({ includeSubagents: 'false' }))).toBe(false);
    });

    it('enables and clears the flag immutably', () => {
        const base = makeItem({ color: 'red' });

        const enabled = withWidgetSubagentsEnabled(base, true);
        expect(enabled).not.toBe(base);
        expect(isWidgetSubagentsEnabled(enabled)).toBe(true);
        expect(enabled.metadata?.color).toBe('red');

        const disabled = withWidgetSubagentsEnabled(enabled, false);
        expect(isWidgetSubagentsEnabled(disabled)).toBe(false);
        expect(disabled.metadata?.includeSubagents).toBeUndefined();
    });

    it('exposes the sigma marker', () => {
        expect(SUBAGENTS_MARKER).toBe('Σ ');
    });
});
