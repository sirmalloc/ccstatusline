import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class CacheHitRateWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows prompt-cache hit rate for the current session (matches Anthropic Console formula)'; }
    getDisplayName(): string { return 'Cache Hit Rate'; }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cache: ', '87%');
        }

        const metrics = context.tokenMetrics;
        if (!metrics)
            return null;

        const cacheRead = metrics.cacheReadTokens ?? 0;
        const cacheCreation = metrics.cacheCreationTokens ?? 0;
        const denom = cacheRead + cacheCreation + metrics.inputTokens;
        if (denom === 0)
            return null;

        const pct = Math.round((cacheRead / denom) * 100);
        return formatRawOrLabeledValue(item, 'Cache: ', `${pct}%`);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
