import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getUsageErrorMessage,
    resolveWeeklyUsageWindow
} from '../utils/usage';
import { SEVEN_DAY_WINDOW_MS } from '../utils/usage-types';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

function formatBudgetIndicator(usagePercent: number, elapsedMs: number, totalMs: number): string {
    const expectedPercent = (elapsedMs / totalMs) * 100;
    const diff = Math.round(usagePercent - expectedPercent);

    if (diff > 0)
        return `\u2191${diff}%`;
    if (diff < 0)
        return `\u2193${Math.abs(diff)}%`;
    return '\u21940%';
}

export class WeeklyBudgetWidget implements Widget {
    getDefaultColor(): string { return 'brightYellow'; }
    getDescription(): string { return 'Shows weekly usage with budget surplus/deficit indicator'; }
    getDisplayName(): string { return 'Weekly Budget'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Week: ', '27% \u21939%');
        }

        const data = context.usageData ?? {};
        if (data.error)
            return getUsageErrorMessage(data.error);
        if (data.weeklyUsage === undefined)
            return null;

        const percent = Math.max(0, Math.min(100, data.weeklyUsage));
        const rounded = Math.round(percent);
        const window = resolveWeeklyUsageWindow(data);

        if (window && window.elapsedMs > 0 && window.remainingMs > 0) {
            const indicator = formatBudgetIndicator(percent, window.elapsedMs, SEVEN_DAY_WINDOW_MS);
            return formatRawOrLabeledValue(item, 'Week: ', `${rounded}% ${indicator}`);
        }

        return formatRawOrLabeledValue(item, 'Week: ', `${rounded}%`);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}