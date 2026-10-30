import type { RenderUsageData } from '../types/RenderContext';
import type { SessionForecast } from '../types/SessionForecast';
import type { WidgetItem } from '../types/Widget';
import { isAtSessionLimit } from '../widgets/shared/usage-display';

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
 * Claude config directory keeps its own history: its account has its own
 * window. So does each login within it: after /login to another account, that
 * account's window can reset at the very moment the last one's does.
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
    const login = deps.loginFingerprint?.() ?? null;
    const profileKey = login === null ? getClaudeConfigDir() : `${getClaudeConfigDir()}#${login}`;
    const readings = recordSessionUsageReading(profileKey, resetAtMs, clampedPercent, deps);
    // The usage API's percent, when fetched for Block Usage's and Block Reset
    // Timer's limit states, can reach 100 while this session's is still under
    // it. Nothing is left to forecast once they've swapped. (The payload's own
    // percent at 100 already ends the forecast below.)
    if (isAtSessionLimit({ usageData })) {
        return null;
    }
    return forecastSessionUsage({ readings, nowMs, resetAtMs, percent: clampedPercent });
}
