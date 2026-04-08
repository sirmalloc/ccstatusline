import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getUsageErrorMessage,
    resolveUsageWindowWithFallback
} from '../utils/usage';
import { FIVE_HOUR_BLOCK_MS } from '../utils/usage-types';

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

export class SessionBudgetWidget implements Widget {
    getDefaultColor(): string { return 'brightYellow'; }
    getDescription(): string { return 'Shows 5-hour session usage with budget surplus/deficit indicator'; }
    getDisplayName(): string { return 'Session Budget'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, '5h: ', '32% \u219334%');
        }

        const data = context.usageData ?? {};
        if (data.error)
            return getUsageErrorMessage(data.error);
        if (data.sessionUsage === undefined)
            return null;

        const percent = Math.max(0, Math.min(100, data.sessionUsage));
        const rounded = Math.round(percent);
        const window = resolveUsageWindowWithFallback(data, context.blockMetrics);

        if (window && window.elapsedMs > 0 && window.remainingMs > 0) {
            const indicator = formatBudgetIndicator(percent, window.elapsedMs, FIVE_HOUR_BLOCK_MS);
            return formatRawOrLabeledValue(item, '5h: ', `${rounded}% ${indicator}`);
        }

        return formatRawOrLabeledValue(item, '5h: ', `${rounded}%`);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}