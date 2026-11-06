import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatCost,
    resolveNumberFormat
} from '../utils/number-format';

import { formatUsageCurrency } from './shared/currency';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Rate Today: ';
const CLOCK_TIME_KEY = 'clockTime';
const BILLED_SPEND_KEY = 'billedSpend';
const TOGGLE_CLOCK_TIME_ACTION = 'toggle-clock-time';
const TOGGLE_BILLED_SPEND_ACTION = 'toggle-billed-spend';
const HOUR_MS = 60 * 60 * 1000;
// Rates over the first seconds swing wildly, so the widget waits for a full
// minute of the chosen time.
const MIN_DURATION_MS = 60 * 1000;

function isClockTime(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, CLOCK_TIME_KEY);
}

function isBilledSpend(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, BILLED_SPEND_KEY);
}

// Billed spend covers claude.ai and other machines too; the hours only ever
// come from this machine's Claude Code sessions. Billed spend is unknown until
// a usage fetch has run since the UTC day began.
function getTodaysCost(item: WidgetItem, context: RenderContext, claudeCodeCost: number): number | undefined {
    if (!isBilledSpend(item)) {
        return claudeCodeCost;
    }

    const billedCents = context.usageData?.extraUsageUsedToday;
    return billedCents === undefined ? undefined : billedCents / 100;
}

export class DailyCostRateWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows today\'s cost per hour across all of today\'s Claude Code sessions, from Claude Code\'s costs or billed spend'; }
    getDisplayName(): string { return 'Daily Cost Rate'; }
    getCategory(): string { return 'Session'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const time = isClockTime(item) ? 'clock time' : 'active time';
        const cost = isBilledSpend(item) ? 'billed spend' : 'Claude Code cost';
        return { displayText: this.getDisplayName(), modifierText: `(${time}, ${cost})` };
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const timeLabel = item && isClockTime(item) ? '(t)ime: use active time' : '(t)ime: use clock time';
        const costLabel = item && isBilledSpend(item) ? '(b) Claude Code cost' : '(b)illed spend';
        return [
            { key: 't', label: timeLabel, action: TOGGLE_CLOCK_TIME_ACTION },
            { key: 'b', label: costLabel, action: TOGGLE_BILLED_SPEND_ACTION }
        ];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_CLOCK_TIME_ACTION) {
            return toggleMetadataFlag(item, CLOCK_TIME_KEY);
        }
        if (action === TOGGLE_BILLED_SPEND_ACTION) {
            return toggleMetadataFlag(item, BILLED_SPEND_KEY);
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, LABEL, `${formatCost(6.2, format)}/hr`);
        }

        const totals = context.dailyCost;
        if (!totals) {
            return null;
        }

        const cost = getTodaysCost(item, context, totals.claudeCodeCost);
        const durationMs = isClockTime(item) ? totals.clockMs : totals.activeMs;
        if (cost === undefined || durationMs < MIN_DURATION_MS) {
            return null;
        }

        const perHour = cost / (durationMs / HOUR_MS);
        // Billed spend is in the currency the usage API reports, as Extra Usage
        // Today shows it; Claude Code's own costs are in US dollars.
        const amount = isBilledSpend(item)
            ? formatUsageCurrency(perHour, context.usageData?.extraUsageCurrency, format)
            : formatCost(perHour, format);
        return formatRawOrLabeledValue(item, LABEL, `${amount}/hr`);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
