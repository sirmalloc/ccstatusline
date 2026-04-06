import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const PEAK_START_HOUR = 5;  // 5am PT
const PEAK_END_HOUR = 11;   // 11am PT
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

interface PeakTimeInfo {
    isPeak: boolean;
    dayName: string;
    hour: number;
    minute: number;
}

function getPacificTime(now: Date = new Date()): PeakTimeInfo {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false
    });
    const parts = Object.fromEntries(
        dtf.formatToParts(now).map(p => [p.type, p.value])
    );
    const dayName = parts.weekday ?? '';
    const hour = parseInt(parts.hour ?? '0', 10);
    const minute = parseInt(parts.minute ?? '0', 10);
    const isWeekday = WEEKDAYS.includes(dayName);
    const isPeak = isWeekday && hour >= PEAK_START_HOUR && hour < PEAK_END_HOUR;

    return { isPeak, dayName, hour, minute };
}

function formatDuration(totalMinutes: number): string {
    if (totalMinutes <= 0)
        return '0m';
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0)
        return `${m}m`;
    if (m === 0)
        return `${h}h`;
    return `${h}h${m}m`;
}

function minutesUntilHour(currentHour: number, currentMinute: number, targetHour: number): number {
    return (targetHour - currentHour) * 60 - currentMinute;
}

function getCountdown(info: PeakTimeInfo): string {
    const { isPeak, dayName, hour, minute } = info;

    if (isPeak) {
        return formatDuration(minutesUntilHour(hour, minute, PEAK_END_HOUR));
    }

    const dayIndex = WEEKDAYS.indexOf(dayName);
    const isWeekday = dayIndex !== -1;
    let daysUntil: number;

    if (isWeekday && hour < PEAK_START_HOUR) {
        daysUntil = 0;
    } else if (dayIndex === 4 && hour >= PEAK_END_HOUR) {
        daysUntil = 3; // Friday after peak → Monday
    } else if (dayName === 'Sat') {
        daysUntil = 2;
    } else if (dayName === 'Sun') {
        daysUntil = 1;
    } else if (isWeekday && hour >= PEAK_END_HOUR) {
        daysUntil = 1;
    } else {
        daysUntil = 0;
    }

    const totalMinutes = daysUntil * 24 * 60 + minutesUntilHour(hour, minute, PEAK_START_HOUR);
    return formatDuration(totalMinutes);
}

export class PeakHoursWidget implements Widget {
    getDefaultColor(): string { return 'brightRed'; }
    getDescription(): string { return 'Shows whether Anthropic peak hours are active (weekdays 5am\u201311am PT) with countdown'; }
    getDisplayName(): string { return 'Peak Hours'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, '', '\u26a1 Peak 3h20m');
        }

        const info = getPacificTime();
        const countdown = getCountdown(info);

        if (info.isPeak) {
            return formatRawOrLabeledValue(item, '', `\u26a1 Peak ${countdown}`);
        }

        return formatRawOrLabeledValue(item, '', `Off-peak ${countdown}`);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}