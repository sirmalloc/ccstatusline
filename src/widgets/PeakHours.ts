import { getColorLevelString } from '../types/ColorLevel';
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { applyColors } from '../utils/colors';
import { formatUsageDuration } from '../utils/usage';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    isUsageCompact,
    toggleUsageCompact
} from './shared/usage-display';

const PEAK_START_HOUR = 5;
const PEAK_END_HOUR = 11;

const WEEKDAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const pacificFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
});

interface PacificTimeParts {
    weekday: number;  // 0=Sun, 1=Mon, ..., 6=Sat
    hour: number;
    minute: number;
    second: number;
}

export function getPacificTimeParts(now: Date): PacificTimeParts {
    const parts = pacificFormatter.formatToParts(now);

    let weekday = 0;
    let hour = 0;
    let minute = 0;
    let second = 0;

    for (const part of parts) {
        if (part.type === 'weekday') {
            weekday = WEEKDAY_MAP[part.value] ?? 0;
        } else if (part.type === 'hour') {
            hour = parseInt(part.value, 10);
            // Intl hour12:false can return 24 for midnight in some locales
            if (hour === 24)
                hour = 0;
        } else if (part.type === 'minute') {
            minute = parseInt(part.value, 10);
        } else if (part.type === 'second') {
            second = parseInt(part.value, 10);
        }
    }

    return { weekday, hour, minute, second };
}

export function isPeakHours(pt: PacificTimeParts): boolean {
    const isWeekday = pt.weekday >= 1 && pt.weekday <= 5;
    return isWeekday && pt.hour >= PEAK_START_HOUR && pt.hour < PEAK_END_HOUR;
}

export function msUntilPeakEnds(pt: PacificTimeParts): number {
    const hoursLeft = PEAK_END_HOUR - pt.hour - 1;
    const minutesLeft = 59 - pt.minute;
    const secondsLeft = 60 - pt.second;
    return ((hoursLeft * 60 + minutesLeft) * 60 + secondsLeft) * 1000;
}

export function msUntilNextPeakStarts(pt: PacificTimeParts): number {
    const { weekday, hour, minute, second } = pt;

    const beforePeakToday = hour < PEAK_START_HOUR;
    const isWeekday = weekday >= 1 && weekday <= 5;

    let daysUntil: number;

    if (isWeekday && beforePeakToday) {
        daysUntil = 0;
    } else if (weekday === 5) {
        // Friday after peak → Monday
        daysUntil = 3;
    } else if (weekday === 6) {
        // Saturday → Monday
        daysUntil = 2;
    } else if (weekday === 0) {
        // Sunday → Monday
        daysUntil = 1;
    } else {
        // Mon-Thu after peak → next day
        daysUntil = 1;
    }

    const hoursUntilTarget = daysUntil * 24 + (PEAK_START_HOUR - hour - 1);
    const minutesLeft = 59 - minute;
    const secondsLeft = 60 - second;
    return ((hoursUntilTarget * 60 + minutesLeft) * 60 + secondsLeft) * 1000;
}

export class PeakHoursWidget implements Widget {
    // Empty string prevents the renderer from wrapping output in a default color,
    // allowing the widget's embedded ANSI color codes (red/green) to take effect.
    getDefaultColor(): string { return ''; }
    getDescription(): string { return 'Shows peak hours status and countdown (weekdays 5am-11am PT)'; }
    getDisplayName(): string { return 'Peak Hours'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const compact = isUsageCompact(item);
        return {
            displayText: this.getDisplayName(),
            modifierText: compact ? 'compact' : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-compact') {
            return toggleUsageCompact(item);
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const compact = isUsageCompact(item);
        const colorLevel = getColorLevelString(settings.colorLevel);

        if (context.isPreview) {
            const peakText = formatRawOrLabeledValue(item, '\u26A0 Peak: ', compact ? '2h15m' : '2hr 15m');
            return applyColors(peakText, 'red', undefined, undefined, colorLevel);
        }

        const now = new Date();
        const pt = getPacificTimeParts(now);
        const peak = isPeakHours(pt);

        if (peak) {
            const remaining = msUntilPeakEnds(pt);
            const duration = formatUsageDuration(remaining, compact, false);
            const text = formatRawOrLabeledValue(item, '\u26A0 Peak: ', duration);
            return applyColors(text, 'red', undefined, undefined, colorLevel);
        }

        const until = msUntilNextPeakStarts(pt);
        const duration = formatUsageDuration(until, compact);
        const text = formatRawOrLabeledValue(item, 'Peak in: ', duration);
        return applyColors(text, 'green', undefined, undefined, colorLevel);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 's', label: 'Short time', action: 'toggle-compact' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return false; }
}