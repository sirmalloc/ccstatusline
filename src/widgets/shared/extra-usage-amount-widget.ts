import type {
    RenderContext,
    RenderUsageData
} from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import { resolveNumberFormat } from '../../utils/number-format';
import { getUsageErrorMessage } from '../../utils/usage';

import { formatUsageCurrency } from './currency';
import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './extra-usage-disabled';
import { isHidden } from './hideable';
import { formatRawOrLabeledValue } from './raw-or-labeled';
import { USAGE_NO_DATA_HIDEABLE_STATE } from './usage-display';

// The Extra Usage Used and Remaining widgets show one labeled amount of money
// from the usage API. They differ in how the amount is worked out, and their
// label, name, description and preview sample.
export abstract class ExtraUsageAmountWidget implements Widget {
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    protected abstract readonly label: string;
    // The TUI preview's sample amount, in dollars
    protected abstract readonly previewDollars: number;
    // The amount in dollars, or null when the usage data doesn't have what it needs
    protected abstract getDollars(data: RenderUsageData): number | null;

    getDefaultColor(): string { return 'green'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return this.label; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatUsageCurrency(this.previewDollars, undefined, format));
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }

        const dollars = data.extraUsageEnabled === true ? this.getDollars(data) : null;
        if (dollars === null) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatUsageCurrency(dollars, data.extraUsageCurrency, format));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
