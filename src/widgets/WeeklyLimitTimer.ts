import type {
    RenderContext,
    RenderUsageData
} from '../types/RenderContext';
import { getWeeklyLimitInMs } from '../utils/weekly-limit';

import { LimitTimerWidget } from './shared/limit-timer-widget';

export type WeeklyLimitWindow = 'weekly' | 'fable-weekly';

interface WeeklyLimitWindowConfig {
    label: string;
    displayName: string;
    description: string;
    previewLimitInMs: number;
    usageField: 'weeklyUsage' | 'fableUsage';
    // The first of these with a value. Fable's window resets with the
    // all-models one when the API sends no reset of its own, as Weekly Fable
    // Usage's time cursor assumes.
    resetFields: readonly ('weeklyResetAt' | 'fableResetAt')[];
}

const HOUR_MS = 60 * 60 * 1000;

const WEEKLY_LIMIT_WINDOWS: Record<WeeklyLimitWindow, WeeklyLimitWindowConfig> = {
    'weekly': {
        label: 'Weekly limit in: ',
        displayName: 'Weekly Limit Timer',
        description: 'Time until the 7-day limit at this week\'s average pace; shown only when that comes before the reset',
        previewLimitInMs: 37 * HOUR_MS,
        usageField: 'weeklyUsage',
        resetFields: ['weeklyResetAt']
    },
    'fable-weekly': {
        label: 'Fable limit in: ',
        displayName: 'Weekly Fable Limit Timer',
        description: 'Time until the Fable-only 7-day limit at this week\'s average pace; shown only when that comes before the reset',
        previewLimitInMs: 52 * HOUR_MS,
        usageField: 'fableUsage',
        resetFields: ['fableResetAt', 'weeklyResetAt']
    }
};

function getResetAt(data: RenderUsageData, config: WeeklyLimitWindowConfig): string | undefined {
    for (const field of config.resetFields) {
        if (data[field] !== undefined) {
            return data[field];
        }
    }
    return undefined;
}

// The limit timers for the 7-day windows: all models by default, or Fable alone
export class WeeklyLimitTimerWidget extends LimitTimerWidget {
    protected readonly label: string;
    protected readonly previewLimitInMs: number;
    private readonly config: WeeklyLimitWindowConfig;

    constructor(window: WeeklyLimitWindow = 'weekly') {
        super();
        this.config = WEEKLY_LIMIT_WINDOWS[window];
        this.label = this.config.label;
        this.previewLimitInMs = this.config.previewLimitInMs;
    }

    getDescription(): string { return this.config.description; }
    getDisplayName(): string { return this.config.displayName; }

    protected getLimitInMs(context: RenderContext): number | null {
        const data = context.usageData ?? {};
        const percent = data[this.config.usageField];
        const resetAt = getResetAt(data, this.config);
        if (percent === undefined || resetAt === undefined) {
            return null;
        }

        return getWeeklyLimitInMs({ percent, nowMs: Date.now(), resetAtMs: Date.parse(resetAt) });
    }
}
