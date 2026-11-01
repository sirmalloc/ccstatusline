import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { resolveNumberFormat } from '../utils/number-format';
import { getUsageErrorMessage } from '../utils/usage';

import { formatUsageCurrency } from './shared/currency';
import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './shared/extra-usage-disabled';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import { USAGE_NO_DATA_HIDEABLE_STATE } from './shared/usage-display';

const LABEL = 'Overage Limit: ';

export class ExtraUsageLimitWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows your monthly extra usage limit (Pro/Max overage or Enterprise spend)'; }
    getDisplayName(): string { return 'Extra Usage Limit'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            // Matches the Extra Usage Used ($106) and Remaining ($3,894) samples.
            return formatRawOrLabeledValue(item, LABEL, formatUsageCurrency(4000, undefined, format));
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, LABEL, 'n/a');
        }
        if (data.extraUsageEnabled !== true) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // Once extra usage is known to be on, a missing monthly limit means
        // none is set, not that the data is still loading (#413).
        if (data.extraUsageLimit === undefined) {
            return formatRawOrLabeledValue(item, LABEL, 'none');
        }

        // extraUsageLimit is in cents
        const limitDollars = data.extraUsageLimit / 100;
        const formatted = formatUsageCurrency(limitDollars, data.extraUsageCurrency, format);

        return formatRawOrLabeledValue(item, LABEL, formatted);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
