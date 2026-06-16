import type { NumberFormat } from '../types/NumberFormat';
import type { SpeedMetrics } from '../types/SpeedMetrics';

import { renderMagnitude } from './number-format';

/**
 * Calculates output tokens per second from speed metrics.
 *
 * @param metrics SpeedMetrics containing timing and token data
 * @returns Output tokens per second, or null if duration is zero
 */
export function calculateOutputSpeed(metrics: SpeedMetrics): number | null {
    if (metrics.totalDurationMs === 0) {
        return null;
    }
    const seconds = metrics.totalDurationMs / 1000;
    return metrics.outputTokens / seconds;
}

/**
 * Calculates input tokens per second from speed metrics.
 *
 * @param metrics SpeedMetrics containing timing and token data
 * @returns Input tokens per second, or null if duration is zero
 */
export function calculateInputSpeed(metrics: SpeedMetrics): number | null {
    if (metrics.totalDurationMs === 0) {
        return null;
    }
    const seconds = metrics.totalDurationMs / 1000;
    return metrics.inputTokens / seconds;
}

/**
 * Calculates total tokens per second from speed metrics.
 *
 * @param metrics SpeedMetrics containing timing and token data
 * @returns Total tokens per second, or null if duration is zero
 */
export function calculateTotalSpeed(metrics: SpeedMetrics): number | null {
    if (metrics.totalDurationMs === 0) {
        return null;
    }
    const seconds = metrics.totalDurationMs / 1000;
    return metrics.totalTokens / seconds;
}

/**
 * Formats a tokens per second value for display.
 *
 * @param tokensPerSec Tokens per second value, or null if unavailable
 * @param format Optional precision override (style/decimals); empty = unchanged
 * @returns Formatted string (e.g., "42.5 t/s", "1.2k t/s", or "—" for null)
 */
export function formatSpeed(tokensPerSec: number | null, format: NumberFormat = {}): string {
    if (tokensPerSec === null) {
        return '—';
    }

    if (tokensPerSec >= 1000) {
        return `${renderMagnitude(tokensPerSec / 1000, format, 1)}k t/s`;
    }

    return `${renderMagnitude(tokensPerSec, format, 1)} t/s`;
}
