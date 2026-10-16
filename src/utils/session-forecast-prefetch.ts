import type { RenderUsageData } from '../types/RenderContext';
import type { SessionForecast } from '../types/SessionForecast';
import type { WidgetItem } from '../types/Widget';

import { getClaudeConfigDir } from './claude-settings';
import { forecastSessionUsage } from './session-forecast';
import {
    getDefaultSessionUsageHistoryDeps,
    recordSessionUsageReading,
    type SessionUsageHistoryDeps
} from './session-usage-history';

const SESSION_FORECAST_WIDGET_TYPES = new Set(['block-forecast', 'block-limit-timer']);

/**
 * Records this render's session percent and forecasts the 5-hour window, once
 * per status line, for Block Forecast and Block Limit Timer to read. Each
 * Claude config directory keeps its own history: its account has its own window.
 */
export function computeSessionForecastIfNeeded(
    lines: WidgetItem[][],
    usageData: RenderUsageData | null,
    deps: SessionUsageHistoryDeps = getDefaultSessionUsageHistoryDeps()
): SessionForecast | null {
    if (!lines.some(line => line.some(item => SESSION_FORECAST_WIDGET_TYPES.has(item.type)))) {
        return null;
    }

    const percent = usageData?.sessionUsage;
    const resetAtMs = usageData?.sessionResetAt === undefined ? Number.NaN : Date.parse(usageData.sessionResetAt);
    const nowMs = deps.now();
    if (percent === undefined || !Number.isFinite(resetAtMs) || resetAtMs <= nowMs) {
        return null;
    }

    const clampedPercent = Math.max(0, Math.min(100, percent));
    const readings = recordSessionUsageReading(getClaudeConfigDir(), resetAtMs, clampedPercent, deps);
    return forecastSessionUsage({ readings, nowMs, resetAtMs, percent: clampedPercent });
}
