import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getUsageErrorMessage } from '../utils/usage';

import {
    appendHideDisabledModifier,
    getHideExtraUsageDisabledKeybind,
    handleToggleExtraUsageDisabledAction,
    isHideExtraUsageDisabledEnabled
} from './shared/extra-usage-disabled';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class ExtraUsageUsedWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows USD spent on extra usage (pay-as-you-go overage)'; }
    getDisplayName(): string { return 'Extra Usage Used'; }
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
            return formatRawOrLabeledValue(item, 'Overage Used: ', '$106.00');
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHideExtraUsageDisabledEnabled(item)
                ? null
                : formatRawOrLabeledValue(item, 'Overage Used: ', 'n/a');
        }
        if (data.extraUsageEnabled !== true || data.extraUsageUsed === undefined) {
            if (data.error)
                return getUsageErrorMessage(data.error);
            return null;
        }

        // extraUsageUsed is in cents
        const usedDollars = data.extraUsageUsed / 100;
        const formatted = `$${usedDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        return formatRawOrLabeledValue(item, 'Overage Used: ', formatted);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getHideExtraUsageDisabledKeybind()];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
