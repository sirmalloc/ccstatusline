import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getUsageErrorMessage } from '../utils/usage';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class ExtraUsageRemainingWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows remaining USD of your monthly extra usage limit'; }
    getDisplayName(): string { return 'Extra Usage Remaining'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Overage Left: ', '$3,894.00');
        }

        const data = context.usageData ?? {};
        if (data.error)
            return getUsageErrorMessage(data.error);
        if (!data.extraUsageEnabled || data.extraUsageLimit === undefined || data.extraUsageUsed === undefined)
            return null;

        // extraUsageLimit is in cents; extraUsageUsed is in dollars
        const limitDollars = data.extraUsageLimit / 100;
        const remaining = Math.max(0, limitDollars - data.extraUsageUsed);
        const formatted = `$${remaining.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        return formatRawOrLabeledValue(item, 'Overage Left: ', formatted);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
