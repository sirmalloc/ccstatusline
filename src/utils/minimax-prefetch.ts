import type { WidgetItem } from '../types/Widget';

import { fetchMiniMaxQuota } from './minimax-quota';

const MINIMAX_QUOTA_WIDGET_TYPES = new Set<string>([
    'minimax-quota'
]);

// Widget types that use MiniMax reset time
const BLOCK_TIMER_WIDGET_TYPES = new Set<string>([
    'block-timer',
    'block-reset-timer'
]);

export function hasMiniMaxQuotaWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => MINIMAX_QUOTA_WIDGET_TYPES.has(item.type)));
}

export function hasBlockTimerWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => BLOCK_TIMER_WIDGET_TYPES.has(item.type)));
}

// Start prefetching MiniMax quota (fire and forget)
export function prefetchMiniMaxQuotaIfNeeded(lines: WidgetItem[][]): void {
    // Prefetch if we have MiniMax quota widget OR block timer widgets
    // (block timers use MiniMax reset time when available)
    if (!hasMiniMaxQuotaWidgets(lines) && !hasBlockTimerWidgets(lines)) {
        return;
    }

    // Fire and forget - this will cache the result
    // Subsequent calls to getMiniMaxQuota() will use the cache
    fetchMiniMaxQuota().catch(() => {
        // Ignore errors - the widget will show nothing if quota unavailable
    });
}
