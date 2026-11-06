import type {
    RenderContext,
    RenderUsageData
} from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';
import { getUsageErrorMessage } from '../utils/usage';

import { EXTRA_USAGE_DISABLED_HIDEABLE_STATE } from './shared/extra-usage-disabled';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    USAGE_NO_DATA_HIDEABLE_STATE,
    cycleUsageDisplayMode,
    formatUsageBar,
    getUsageDisplayModifierText,
    getUsagePercentCustomKeybinds,
    isUsageInverted,
    toggleUsageInverted
} from './shared/usage-display';

// The usage API reports `utilization: null` until the first charge of the month,
// while still reporting the amount spent and the monthly limit (both in cents).
function getExtraUsageUtilization(data: RenderUsageData): number | undefined {
    if (data.extraUsageUtilization !== undefined) {
        return data.extraUsageUtilization;
    }
    if (data.extraUsageUsed === undefined || data.extraUsageLimit === undefined || data.extraUsageLimit <= 0) {
        return undefined;
    }
    return data.extraUsageUsed / data.extraUsageLimit * 100;
}
const LABEL = 'Overage: ';

export class ExtraUsageUtilizationWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows extra usage as a percentage of your monthly limit (Pro/Max overage or Enterprise spend)'; }
    getDisplayName(): string { return 'Extra Usage Utilization'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, { showUsageDirection: true })
        };
    }

    getHideableStates(): HideableState[] {
        return [EXTRA_USAGE_DISABLED_HIDEABLE_STATE, USAGE_NO_DATA_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item, [], true, true);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const inverted = isUsageInverted(item);
        const format = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            const previewPercent = 2.6;
            const renderedPercent = inverted ? 100 - previewPercent : previewPercent;

            const bar = formatUsageBar(item, renderedPercent, format);
            if (bar !== null) {
                return formatRawOrLabeledValue(item, this.getLabelPrefix(), bar);
            }

            return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatPercent(renderedPercent, format));
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHidden(item, EXTRA_USAGE_DISABLED_HIDEABLE_STATE.key)
                ? null
                : formatRawOrLabeledValue(item, this.getLabelPrefix(), 'n/a');
        }
        const utilization = getExtraUsageUtilization(data);
        if (data.extraUsageEnabled !== true || utilization === undefined) {
            if (data.error) {
                return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                    ? null
                    : getUsageErrorMessage(data.error);
            }
            return null;
        }

        // utilization is a percentage (0-100), not a fraction
        const percent = Math.max(0, Math.min(100, utilization));
        const renderedPercent = inverted ? 100 - percent : percent;

        const bar = formatUsageBar(item, renderedPercent, format);
        if (bar !== null) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), bar);
        }

        return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatPercent(renderedPercent, format));
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item, false);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
