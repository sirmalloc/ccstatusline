import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../../types/Settings';
import type { WidgetItem } from '../../../types/Widget';
import { formatUsageBar } from '../usage-display';

const item = (display?: string): WidgetItem => ({ id: 'u', type: 'session-usage', metadata: display ? { display } : undefined });

describe('formatUsageBar', () => {
    it('formats each bar mode with its width and the percentage', () => {
        expect(formatUsageBar(item('progress'), 50, {}, DEFAULT_SETTINGS)).toBe(`[${'█'.repeat(16)}${'░'.repeat(16)}] 50.0%`);
        expect(formatUsageBar(item('progress-short'), 50, {}, DEFAULT_SETTINGS)).toBe(`[${'█'.repeat(8)}${'░'.repeat(8)}] 50.0%`);
        expect(formatUsageBar(item('slider'), 50, {}, DEFAULT_SETTINGS)).toBe(`${'▓'.repeat(5)}${'░'.repeat(5)} 50.0%`);
        expect(formatUsageBar(item('slider-only'), 50, {}, DEFAULT_SETTINGS)).toBe(`${'▓'.repeat(5)}${'░'.repeat(5)}`);
        expect(formatUsageBar(item('line'), 50, {}, DEFAULT_SETTINGS)).toBe(`${'━'.repeat(8)}${'─'.repeat(8)} 50.0%`);
    });

    it('returns null outside the bar modes, without asking for the cursor', () => {
        let asked = false;
        expect(formatUsageBar(item(), 50, {}, DEFAULT_SETTINGS, () => {
            asked = true;
            return { cursorPercent: 10 };
        })).toBeNull();
        expect(asked).toBe(false);
    });

    it('draws the time cursor when given one', () => {
        expect(formatUsageBar(item('slider-only'), 50, {}, DEFAULT_SETTINGS, () => ({ cursorPercent: 90 }))).toBe(`${'▓'.repeat(5)}${'░'.repeat(4)}│`);
    });
});
