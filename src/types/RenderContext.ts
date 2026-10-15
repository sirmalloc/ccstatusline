import type {
    BlockMetrics,
    SkillsMetrics
} from '../types';

import type { SpeedMetrics } from './SpeedMetrics';
import type { StatusJSON } from './StatusJSON';
import type { TokenMetrics } from './TokenMetrics';

export interface RenderUsageData {
    sessionUsage?: number;
    sessionResetAt?: string;
    weeklyUsage?: number;
    weeklyResetAt?: string;
    weeklySonnetUsage?: number;
    weeklySonnetResetAt?: string;
    weeklyOpusUsage?: number;
    weeklyOpusResetAt?: string;
    fableUsage?: number;
    fableResetAt?: string;
    spendLimitUsage?: number;
    spendLimitUsedUsd?: number;
    spendLimitLimitUsd?: number;
    extraUsageEnabled?: boolean;
    extraUsageLimit?: number;
    extraUsageUsed?: number;
    extraUsageUtilization?: number;
    extraUsageCurrency?: string;
    error?: 'no-credentials' | 'timeout' | 'rate-limited' | 'api-error' | 'parse-error';
}

export interface ClaudeStatusRenderData {
    indicator?: string;
    incidents?: {
        impact: 'minor' | 'major' | 'critical';
        startMs: number;
        endMs: number | null;
    }[];
    error?: boolean;
}

export interface CompactionData {
    count: number;
    byTrigger: { auto: number; manual: number; unknown: number };
    tokensReclaimed: number;
}

/**
 * Everything a render needs from the surrounding process, resolved once per
 * request by the entry point. Render-path code reads process state through
 * this snapshot instead of touching process/env directly, so a future
 * shared-process runner (#14) can serve concurrent requests (#15).
 */
export interface RenderInvocation {
    /** Resolved settings.json path for this request. */
    configPath: string;
    /** Working directory snapshot for this request. */
    cwd: string;
    /** Environment snapshot for this request. */
    env: NodeJS.ProcessEnv;
    /** Terminal width probed once per request (null = no TTY found). */
    terminalWidth: number | null;
}

export interface RenderContext {
    data?: StatusJSON;
    tokenMetrics?: TokenMetrics | null;
    speedMetrics?: SpeedMetrics | null;
    windowedSpeedMetrics?: Record<string, SpeedMetrics> | null;
    usageData?: RenderUsageData | null;
    claudeStatusData?: ClaudeStatusRenderData | null;
    sessionDuration?: string | null;
    transcriptSessionName?: string | null;
    transcriptThinkingEffort?: { value: string; known: boolean } | null;
    blockMetrics?: BlockMetrics | null;
    skillsMetrics?: SkillsMetrics | null;
    compactionData?: CompactionData | null;
    terminalWidth?: number | null;
    isPreview?: boolean;
    minimalist?: boolean;
    gitCacheTtlSeconds?: number;
    customCommandCacheTtlSeconds?: number;
    gitReviewNeedsChecks?: boolean;
    lineIndex?: number;  // Index of the current line being rendered (for theme cycling)
    globalSeparatorIndex?: number;  // Global separator index that continues across lines

    /**
     * Environment and working directory snapshots for this render (#18).
     * Provider calls that spawn child processes or read env-dependent config
     * resolve through these instead of process.env/process.cwd, so the daemon
     * can serve concurrent requests for different sessions without swapping
     * process-global state. Unset in one-shot mode (process state is used).
     */
    env?: NodeJS.ProcessEnv;
    cwd?: string;

    // For git widget thresholds
    gitData?: {
        changedFiles?: number;
        insertions?: number;
        deletions?: number;
    };
    globalPowerlineThemeIndex?: number;  // Global powerline theme index that continues across lines
    globalPowerlineStartCapIndex?: number;  // Global start cap index across powerline flex segments and lines
}
