import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { resolveNumberFormat } from '../utils/number-format';
import { getUsageErrorMessage } from '../utils/usage';

import { formatUsageCurrency } from './shared/currency';
import { countBudgetDaysLeft } from './shared/daily-budget';
import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './shared/extra-usage-disabled';
import { isHidden } from './shared/hideable';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import { USAGE_NO_DATA_HIDEABLE_STATE } from './shared/usage-display';

const LABEL = 'Daily Budget: ';
const WEEKDAYS_ONLY_KEY = 'weekdaysOnly';
const TOGGLE_WEEKDAYS_ACTION = 'toggle-weekdays';

function isWeekdaysOnly(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, WEEKDAYS_ONLY_KEY);
}

export class ExtraUsageDailyBudgetWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows what\'s left of your monthly extra usage limit per day left in the month, optionally counting weekdays only'; }
    getDisplayName(): string { return 'Extra Usage Daily Budget'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: isWeekdaysOnly(item) ? '(weekdays)' : undefined
        };
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const label = item && isWeekdaysOnly(item) ? '(w) count weekends' : '(w)eekdays only';
        return [{ key: 'w', label, action: TOGGLE_WEEKDAYS_ACTION }];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return action === TOGGLE_WEEKDAYS_ACTION ? toggleMetadataFlag(item, WEEKDAYS_ONLY_KEY) : null;
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            // The Extra Usage Remaining sample ($3,894) over 20 days, so the
            // preview doesn't change with the date.
            return formatRawOrLabeledValue(item, LABEL, formatUsageCurrency(3894 / 20, undefined, format));
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, LABEL, 'n/a');
        }
        if (data.extraUsageEnabled !== true || data.extraUsageLimit === undefined || data.extraUsageUsed === undefined) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // Both extraUsageLimit and extraUsageUsed are in cents
        const remainingDollars = Math.max(0, data.extraUsageLimit - data.extraUsageUsed) / 100;
        const daysLeft = countBudgetDaysLeft(Date.now(), isWeekdaysOnly(item));
        const formatted = formatUsageCurrency(remainingDollars / daysLeft, data.extraUsageCurrency, format);

        return formatRawOrLabeledValue(item, LABEL, formatted);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
