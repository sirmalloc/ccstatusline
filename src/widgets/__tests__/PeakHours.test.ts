import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { PeakHoursWidget } from '../PeakHours';

const baseItem: WidgetItem = { id: 'test', type: 'peak-hours' };

function render(item: WidgetItem, context: RenderContext = {}): string | null {
    return new PeakHoursWidget().render(item, context, DEFAULT_SETTINGS);
}

describe('PeakHoursWidget', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns preview text', () => {
        expect(render(baseItem, { isPreview: true })).toBe('\u26a1 Peak 3h20m');
    });

    it('shows peak during weekday peak hours', () => {
        // Wednesday 8:00 AM PT = Wednesday 3:00 PM UTC
        vi.setSystemTime(new Date('2026-04-08T15:00:00Z'));
        const result = render(baseItem);
        expect(result).toContain('\u26a1 Peak');
        expect(result).toContain('3h');
    });

    it('shows off-peak during weekday non-peak hours', () => {
        // Wednesday 2:00 PM PT = Wednesday 9:00 PM UTC
        vi.setSystemTime(new Date('2026-04-08T21:00:00Z'));
        const result = render(baseItem);
        expect(result).toContain('Off-peak');
    });

    it('shows off-peak on weekends', () => {
        // Saturday 8:00 AM PT = Saturday 3:00 PM UTC
        vi.setSystemTime(new Date('2026-04-11T15:00:00Z'));
        const result = render(baseItem);
        expect(result).toContain('Off-peak');
    });

    it('returns non-null for all conditions', () => {
        vi.setSystemTime(new Date('2026-04-06T12:00:00Z'));
        expect(render(baseItem)).not.toBeNull();
    });
});