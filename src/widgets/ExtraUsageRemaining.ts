import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getUsageErrorMessage } from '../utils/usage';

import { formatUsageCurrency } from './shared/currency';
import {
    appendHideDisabledModifier,
    getHideExtraUsageDisabledKeybind,
    handleToggleExtraUsageDisabledAction,
    isHideExtraUsageDisabledEnabled
} from './shared/extra-usage-disabled';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class ExtraUsageRemainingWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows remaining USD of your monthly extra usage limit'; }
    getDisplayName(): string { return 'Extra Usage Remaining'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: appendHideDisabledModifier(undefined, item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleToggleExtraUsageDisabledAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Overage Left: ', '$3,894.00');
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHideExtraUsageDisabledEnabled(item)
                ? null
                : formatRawOrLabeledValue(item, 'Overage Left: ', 'n/a');
        }
        if (data.extraUsageEnabled !== true || data.extraUsageLimit === undefined || data.extraUsageUsed === undefined) {
            if (data.error)
                return getUsageErrorMessage(data.error);
            return null;
        }

        // Both extraUsageLimit and extraUsageUsed are in cents
        const limitDollars = data.extraUsageLimit / 100;
        const usedDollars = data.extraUsageUsed / 100;
        const remaining = Math.max(0, limitDollars - usedDollars);
        const formatted = formatUsageCurrency(remaining, data.extraUsageCurrency);

        return formatRawOrLabeledValue(item, 'Overage Left: ', formatted);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getHideExtraUsageDisabledKeybind()];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
