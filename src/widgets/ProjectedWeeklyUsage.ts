import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getUsageErrorMessage,
    getWeeklyUsageWindowFromResetAt
} from '../utils/usage-windows';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class ProjectedWeeklyUsageWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Projects weekly usage percentage by end of 7-day window'; }
    getDisplayName(): string { return 'Weekly Usage Projected'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: undefined
        };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Projected: ', '72%');
        }

        const data = context.usageData ?? {};
        if (data.error)
            return getUsageErrorMessage(data.error);
        if (data.weeklyUsage === undefined)
            return null;

        const window = getWeeklyUsageWindowFromResetAt(data.weeklyResetAt);
        if (!window || window.elapsedPercent < 1) {
            return null;
        }

        const projected = data.weeklyUsage / (window.elapsedPercent / 100);

        return formatRawOrLabeledValue(item, 'Projected: ', `${projected.toFixed(0)}%`);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}