import type {
    BlockMetrics,
    SkillsMetrics
} from '../types';

import type { ProfileData } from '../utils/profile-fetch';
import type { SpeedMetrics } from './SpeedMetrics';
import type { StatusJSON } from './StatusJSON';
import type { TokenMetrics } from './TokenMetrics';

export interface RenderUsageData {
    sessionUsage?: number;
    sessionResetAt?: string;
    weeklyUsage?: number;
    weeklyResetAt?: string;
    extraUsageEnabled?: boolean;
    extraUsageLimit?: number;
    extraUsageUsed?: number;
    extraUsageUtilization?: number;
    error?: 'no-credentials' | 'timeout' | 'rate-limited' | 'api-error' | 'parse-error';
}

export interface RenderContext {
    data?: StatusJSON;
    tokenMetrics?: TokenMetrics | null;
    speedMetrics?: SpeedMetrics | null;
    windowedSpeedMetrics?: Record<string, SpeedMetrics> | null;
    usageData?: RenderUsageData | null;
    profileData?: ProfileData | null;
    sessionDuration?: string | null;
    blockMetrics?: BlockMetrics | null;
    skillsMetrics?: SkillsMetrics | null;
    terminalWidth?: number | null;
    isPreview?: boolean;
    lineIndex?: number;  // Index of the current line being rendered (for theme cycling)
    globalSeparatorIndex?: number;  // Global separator index that continues across lines
}