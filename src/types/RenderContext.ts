import type { BlockMetrics, SkillsMetrics } from '../types';

import type { StatusJSON } from './StatusJSON';
import type { TokenMetrics } from './TokenMetrics';

export interface RenderContext {
    data?: StatusJSON;
    tokenMetrics?: TokenMetrics | null;
    sessionDuration?: string | null;
    blockMetrics?: BlockMetrics | null;
    skillsMetrics?: SkillsMetrics | null;
    terminalWidth?: number | null;
    isPreview?: boolean;
    lineIndex?: number;  // Index of the current line being rendered (for theme cycling)
    globalSeparatorIndex?: number;  // Global separator index that continues across lines
}