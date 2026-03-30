import type { WidgetItem } from '../types/Widget';

import { fetchMiniMaxQuota } from './minimax-quota';

const MINIMAX_QUOTA_WIDGET_TYPES = new Set<string>([
    'minimax-quota'
]);

export function hasMiniMaxQuotaWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => MINIMAX_QUOTA_WIDGET_TYPES.has(item.type)));
}

// Start prefetching MiniMax quota (fire and forget)
export function prefetchMiniMaxQuotaIfNeeded(lines: WidgetItem[][]): void {
    if (!hasMiniMaxQuotaWidgets(lines)) {
        return;
    }

    // Fire and forget - this will cache the result
    // Subsequent calls to getMiniMaxQuota() will use the cache
    fetchMiniMaxQuota().catch(() => {
        // Ignore errors - the widget will show nothing if quota unavailable
    });
}
