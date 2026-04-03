import chalk from 'chalk';
import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { updateColorMap } from '../../utils/colors';
import {
    PeakHoursWidget,
    getPacificTimeParts,
    isPeakHours,
    msUntilNextPeakStarts,
    msUntilPeakEnds
} from '../PeakHours';

// Enable chalk colors in test environment
chalk.level = 2;
updateColorMap();

function render(widget: PeakHoursWidget, item: WidgetItem, context: RenderContext = {}): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

function stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function baseItem(): WidgetItem {
    return { id: 'peak', type: 'peak-hours' };
}

function widget(): PeakHoursWidget {
    return new PeakHoursWidget();
}

// Helper to mock Date constructor for render tests
const OrigDate = Date;

function withFixedTime<T>(isoString: string, fn: () => T): T {
    const fixedMs = new OrigDate(isoString).getTime();
    const MockDate = class extends OrigDate {
        constructor(value?: string | number | Date) {
            if (value === undefined) {
                super(fixedMs);
            } else {
                super(value as string);
            }
        }

        static override now(): number { return fixedMs; }
    };
    globalThis.Date = MockDate as unknown as DateConstructor;
    try {
        return fn();
    } finally {
        globalThis.Date = OrigDate;
    }
}

afterEach(() => {
    globalThis.Date = OrigDate;
    chalk.level = 2;
});

describe('PeakHoursWidget', () => {
    describe('getPacificTimeParts', () => {
        it('extracts correct parts for a weekday morning in PT (PST)', () => {
            // Wednesday 2025-01-15 at 08:30:45 PT = 16:30:45 UTC (PST is UTC-8)
            const pt = getPacificTimeParts(new Date('2025-01-15T16:30:45Z'));
            expect(pt.weekday).toBe(3); // Wednesday
            expect(pt.hour).toBe(8);
            expect(pt.minute).toBe(30);
            expect(pt.second).toBe(45);
        });

        it('handles PDT correctly in summer', () => {
            // Wednesday 2025-07-16 at 08:30:00 PT = 15:30:00 UTC (PDT is UTC-7)
            const pt = getPacificTimeParts(new Date('2025-07-16T15:30:00Z'));
            expect(pt.weekday).toBe(3); // Wednesday
            expect(pt.hour).toBe(8);
            expect(pt.minute).toBe(30);
        });

        it('identifies Saturday correctly', () => {
            const pt = getPacificTimeParts(new Date('2025-01-18T18:00:00Z'));
            expect(pt.weekday).toBe(6); // Saturday
        });

        it('identifies Sunday correctly', () => {
            const pt = getPacificTimeParts(new Date('2025-01-19T22:00:00Z'));
            expect(pt.weekday).toBe(0); // Sunday
        });
    });

    describe('isPeakHours', () => {
        it('returns true during peak hours on a weekday', () => {
            expect(isPeakHours({ weekday: 1, hour: 5, minute: 0, second: 0 })).toBe(true);
            expect(isPeakHours({ weekday: 3, hour: 8, minute: 30, second: 0 })).toBe(true);
            expect(isPeakHours({ weekday: 5, hour: 10, minute: 59, second: 59 })).toBe(true);
        });

        it('returns false outside peak hours on a weekday', () => {
            expect(isPeakHours({ weekday: 1, hour: 4, minute: 59, second: 59 })).toBe(false);
            expect(isPeakHours({ weekday: 3, hour: 11, minute: 0, second: 0 })).toBe(false);
            expect(isPeakHours({ weekday: 5, hour: 15, minute: 0, second: 0 })).toBe(false);
        });

        it('returns false on weekends even during peak time range', () => {
            expect(isPeakHours({ weekday: 0, hour: 8, minute: 0, second: 0 })).toBe(false);
            expect(isPeakHours({ weekday: 6, hour: 8, minute: 0, second: 0 })).toBe(false);
        });
    });

    describe('msUntilPeakEnds', () => {
        it('calculates remaining time correctly at start of peak', () => {
            const ms = msUntilPeakEnds({ weekday: 1, hour: 5, minute: 0, second: 0 });
            expect(ms).toBe(6 * 60 * 60 * 1000);
        });

        it('calculates remaining time correctly mid-peak', () => {
            const ms = msUntilPeakEnds({ weekday: 3, hour: 8, minute: 30, second: 0 });
            expect(ms).toBe(2.5 * 60 * 60 * 1000);
        });

        it('calculates remaining time near end of peak', () => {
            const ms = msUntilPeakEnds({ weekday: 5, hour: 10, minute: 55, second: 0 });
            expect(ms).toBe(5 * 60 * 1000);
        });
    });

    describe('msUntilNextPeakStarts', () => {
        it('calculates time to next morning on weekday evening', () => {
            // Monday 3pm → Tuesday 5am = 14 hours
            const ms = msUntilNextPeakStarts({ weekday: 1, hour: 15, minute: 0, second: 0 });
            expect(ms).toBe(14 * 60 * 60 * 1000);
        });

        it('calculates time on weekday before peak starts', () => {
            // Tuesday 3am → Tuesday 5am = 2 hours
            const ms = msUntilNextPeakStarts({ weekday: 2, hour: 3, minute: 0, second: 0 });
            expect(ms).toBe(2 * 60 * 60 * 1000);
        });

        it('calculates time from Friday after peak to Monday', () => {
            // Friday 11am → Monday 5am = 66 hours
            const ms = msUntilNextPeakStarts({ weekday: 5, hour: 11, minute: 0, second: 0 });
            expect(ms).toBe(66 * 60 * 60 * 1000);
        });

        it('calculates time from Saturday to Monday', () => {
            // Saturday 10am → Monday 5am = 43 hours
            const ms = msUntilNextPeakStarts({ weekday: 6, hour: 10, minute: 0, second: 0 });
            expect(ms).toBe(43 * 60 * 60 * 1000);
        });

        it('calculates time from Sunday to Monday', () => {
            // Sunday 10am → Monday 5am = 19 hours
            const ms = msUntilNextPeakStarts({ weekday: 0, hour: 10, minute: 0, second: 0 });
            expect(ms).toBe(19 * 60 * 60 * 1000);
        });

        it('calculates time from Friday evening to Monday', () => {
            // Friday 8pm → Monday 5am = 57 hours
            const ms = msUntilNextPeakStarts({ weekday: 5, hour: 20, minute: 0, second: 0 });
            expect(ms).toBe(57 * 60 * 60 * 1000);
        });
    });

    describe('render', () => {
        it('renders preview with red color and warning sign', () => {
            const widget = new PeakHoursWidget();
            const result = render(widget, baseItem(), { isPreview: true }) ?? '';
            expect(result).not.toBe('');
            expect(stripAnsi(result)).toBe('\u26A0 Peak: 2hr 15m');
            expect(result).toContain('\x1b[');
        });

        it('renders compact preview', () => {
            const widget = new PeakHoursWidget();
            const item: WidgetItem = { ...baseItem(), metadata: { compact: 'true' } };
            const result = render(widget, item, { isPreview: true }) ?? '';
            expect(stripAnsi(result)).toBe('\u26A0 Peak: 2h15m');
        });

        it('renders during peak hours with warning sign', () => {
            // Wednesday 8:30 AM PT = 16:30 UTC (PST)
            const result = withFixedTime('2025-01-15T16:30:00Z', () => render(widget(), baseItem())) ?? '';
            expect(result).not.toBe('');
            const plain = stripAnsi(result);
            expect(plain).toMatch(/^⚠ Peak: /);
            expect(plain).toMatch(/2hr 30m/);
        });

        it('renders outside peak hours with countdown', () => {
            // Wednesday 3:00 PM PT = 23:00 UTC (PST)
            const result = withFixedTime('2025-01-15T23:00:00Z', () => render(widget(), baseItem())) ?? '';
            expect(result).not.toBe('');
            const plain = stripAnsi(result);
            expect(plain).toMatch(/^Peak in: /);
        });

        it('renders raw value without label during peak', () => {
            // Wednesday 8:30 AM PT
            const item: WidgetItem = { ...baseItem(), rawValue: true };
            const result = withFixedTime('2025-01-15T16:30:00Z', () => render(widget(), item)) ?? '';
            const plain = stripAnsi(result);
            expect(plain).toBe('2hr 30m');
        });

        it('renders raw value without label outside peak', () => {
            // Wednesday 3:00 PM PT
            const item: WidgetItem = { ...baseItem(), rawValue: true };
            const result = withFixedTime('2025-01-15T23:00:00Z', () => render(widget(), item)) ?? '';
            const plain = stripAnsi(result);
            expect(plain).not.toContain('Peak');
        });

        it('renders weekend countdown to Monday', () => {
            // Saturday 10:00 AM PT = 18:00 UTC (PST)
            const result = withFixedTime('2025-01-18T18:00:00Z', () => render(widget(), baseItem())) ?? '';
            const plain = stripAnsi(result);
            expect(plain).toMatch(/^Peak in: /);
            expect(plain).toMatch(/1d 19hr/);
        });

        it('uses red color during peak hours', () => {
            // Wednesday 8:30 AM PT
            const result = withFixedTime('2025-01-15T16:30:00Z', () => render(widget(), baseItem())) ?? '';
            // ansi256 code 160 for red
            expect(result).toContain('\x1b[38;5;160m');
        });

        it('uses green color outside peak hours', () => {
            // Wednesday 3:00 PM PT
            const result = withFixedTime('2025-01-15T23:00:00Z', () => render(widget(), baseItem())) ?? '';
            // ansi256 code 70 for green
            expect(result).toContain('\x1b[38;5;70m');
        });
    });

    describe('widget interface', () => {
        it('supportsColors returns false', () => {
            const widget = new PeakHoursWidget();
            expect(widget.supportsColors({ id: 'peak', type: 'peak-hours' })).toBe(false);
        });

        it('supportsRawValue returns true', () => {
            const widget = new PeakHoursWidget();
            expect(widget.supportsRawValue()).toBe(true);
        });

        it('getDefaultColor returns empty string to prevent renderer color wrapping', () => {
            const widget = new PeakHoursWidget();
            expect(widget.getDefaultColor()).toBe('');
        });

        it('getCategory returns Usage', () => {
            const widget = new PeakHoursWidget();
            expect(widget.getCategory()).toBe('Usage');
        });

        it('getDisplayName returns Peak Hours', () => {
            const widget = new PeakHoursWidget();
            expect(widget.getDisplayName()).toBe('Peak Hours');
        });
    });

    describe('editor', () => {
        it('toggles compact mode', () => {
            const widget = new PeakHoursWidget();
            const item = baseItem();
            const toggled = widget.handleEditorAction('toggle-compact', item);
            expect(toggled).not.toBeNull();
            expect(toggled?.metadata?.compact).toBe('true');
        });

        it('returns null for unknown action', () => {
            const widget = new PeakHoursWidget();
            expect(widget.handleEditorAction('unknown', baseItem())).toBeNull();
        });

        it('shows compact modifier text when compact', () => {
            const widget = new PeakHoursWidget();
            const item: WidgetItem = { ...baseItem(), metadata: { compact: 'true' } };
            const display = widget.getEditorDisplay(item);
            expect(display.modifierText).toBe('compact');
        });

        it('shows no modifier text when not compact', () => {
            const widget = new PeakHoursWidget();
            const display = widget.getEditorDisplay(baseItem());
            expect(display.modifierText).toBeUndefined();
        });
    });
});