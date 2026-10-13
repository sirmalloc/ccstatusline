import type { Settings } from '../types/Settings';
import type { StatusJSON } from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';
import { isCacheSessionScope } from '../widgets/shared/cache-scope';

import { getContextWindowMetrics } from './context-window';
import { resolveLegacyWidgetType } from './widgets';

// Widgets that read transcript token totals whenever they render: the token
// widgets prefer them over the status JSON totals, or have no other source.
const ALWAYS_TOKEN_METRIC_WIDGETS = new Set<string>([
    'tokens-input',
    'tokens-output',
    'tokens-cached',
    'tokens-total'
]);

// Cache widgets read transcript totals only in their session scope.
const SESSION_SCOPE_CACHE_WIDGETS = new Set<string>([
    'cache-hit-rate',
    'cache-read',
    'cache-write'
]);

/**
 * Whether rendering this configuration can read `RenderContext.tokenMetrics`.
 * Context widgets only fall back to transcript metrics when the status JSON
 * lacks the matching `context_window` field, so the full transcript scan can be
 * skipped when Claude Code already supplies it. Keep in sync with the
 * `context.tokenMetrics` reads in the widgets and in `calculateMaxWidth`.
 */
export function needsTranscriptTokenMetrics(
    lines: WidgetItem[][],
    settings: Pick<Settings, 'flexMode'>,
    data: StatusJSON
): boolean {
    const contextWindow = getContextWindowMetrics(data);
    const missingUsedPercentage = contextWindow.usedPercentage === null;
    const missingContextLength = contextWindow.contextLengthTokens === null;

    if (settings.flexMode === 'full-until-compact' && missingUsedPercentage) {
        return true;
    }

    return lines.some(line => line.some((item) => {
        const type = resolveLegacyWidgetType(item.type);
        if (ALWAYS_TOKEN_METRIC_WIDGETS.has(type)) {
            return true;
        }
        if (SESSION_SCOPE_CACHE_WIDGETS.has(type)) {
            return isCacheSessionScope(item);
        }

        switch (type) {
            case 'context-length':
            case 'context-percentage-usable':
                return missingContextLength;
            case 'context-percentage':
                return missingUsedPercentage;
            case 'context-bar':
                // The bar also uses the presence of transcript metrics to pick a
                // default window size when context_window_size is missing.
                return missingContextLength || contextWindow.windowSize === null;
            default:
                return false;
        }
    }));
}
