import type { RenderContext } from '../types/RenderContext';
import type { TokenMetrics } from '../types/TokenMetrics';
import type { WidgetItem } from '../types/Widget';

export const SUBAGENTS_METADATA_KEY = 'includeSubagents';
export const SUBAGENTS_MARKER = 'Σ ';

export function isWidgetSubagentsEnabled(item: WidgetItem): boolean {
    return item.metadata?.[SUBAGENTS_METADATA_KEY] === 'true';
}

export function withWidgetSubagentsEnabled(item: WidgetItem, on: boolean): WidgetItem {
    if (on) {
        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                [SUBAGENTS_METADATA_KEY]: 'true'
            }
        };
    }

    const { [SUBAGENTS_METADATA_KEY]: _removed, ...restMetadata } = item.metadata ?? {};
    void _removed;
    return {
        ...item,
        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
    };
}

// Selects the subagent-inclusive metrics when the widget opts in, otherwise the
// main-only metrics. Returns null when the needed metrics are unavailable.
export function tokenMetricsForWidget(item: WidgetItem, context: RenderContext): TokenMetrics | null {
    return isWidgetSubagentsEnabled(item)
        ? (context.sessionTokenMetrics ?? null)
        : (context.tokenMetrics ?? null);
}
