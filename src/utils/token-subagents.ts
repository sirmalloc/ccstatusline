import type { RenderContext } from '../types/RenderContext';
import type { TokenMetrics } from '../types/TokenMetrics';
import type { WidgetItem } from '../types/Widget';
import {
    isMetadataFlagEnabled,
    removeMetadataKeys
} from '../widgets/shared/metadata';

export const SUBAGENTS_METADATA_KEY = 'includeSubagents';
export const SUBAGENTS_MARKER = 'Σ ';

export function isWidgetSubagentsEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, SUBAGENTS_METADATA_KEY);
}

// Off is the absence of the key, so a widget left at its default stores nothing.
export function withWidgetSubagentsEnabled(item: WidgetItem, on: boolean): WidgetItem {
    if (!on) {
        return removeMetadataKeys(item, [SUBAGENTS_METADATA_KEY]);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            [SUBAGENTS_METADATA_KEY]: 'true'
        }
    };
}

// Selects the subagent-inclusive metrics when the widget opts in, otherwise the
// main-only metrics. Returns null when the needed metrics are unavailable.
export function tokenMetricsForWidget(item: WidgetItem, context: RenderContext): TokenMetrics | null {
    return isWidgetSubagentsEnabled(item)
        ? (context.sessionTokenMetrics ?? null)
        : (context.tokenMetrics ?? null);
}
