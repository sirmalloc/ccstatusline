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

import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Rate: ';
const CLOCK_TIME_KEY = 'clockTime';
const TOGGLE_CLOCK_TIME_ACTION = 'toggle-clock-time';
const HOUR_MS = 60 * 60 * 1000;
// Rates over the first seconds swing wildly ($0.50 in 30s is $60/hr), so the
// widget waits for a full minute of the chosen time.
const MIN_DURATION_MS = 60 * 1000;

function isClockTime(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, CLOCK_TIME_KEY);
}

export class SessionCostRateWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows the session cost per hour, over the time Claude spent working or the whole session'; }
    getDisplayName(): string { return 'Session Cost Rate'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: isClockTime(item) ? '(clock time)' : '(active time)'
        };
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const label = item && isClockTime(item) ? '(t)ime: use active time' : '(t)ime: use clock time';
        return [{ key: 't', label, action: TOGGLE_CLOCK_TIME_ACTION }];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return action === TOGGLE_CLOCK_TIME_ACTION ? toggleMetadataFlag(item, CLOCK_TIME_KEY) : null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            // The Session Cost sample ($2.45) over 30 minutes.
            return formatRawOrLabeledValue(item, LABEL, `${formatCost(4.9, format)}/hr`);
        }

        const cost = context.data?.cost;
        const totalCost = cost?.total_cost_usd;
        // Active time is how long Claude spent generating (API time); clock time
        // is the whole session, including time spent waiting for the user.
        const durationMs = isClockTime(item) ? cost?.total_duration_ms : cost?.total_api_duration_ms;
        if (totalCost === undefined || durationMs === undefined || durationMs < MIN_DURATION_MS) {
            return null;
        }

        const perHour = totalCost / (durationMs / HOUR_MS);
        return formatRawOrLabeledValue(item, LABEL, `${formatCost(perHour, format)}/hr`);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
