import type { BlockMetrics } from '../types';

import type { StatusJSON } from './StatusJSON';
import type { TokenMetrics } from './TokenMetrics';

export interface ContextWindowInfo {
    inputTokens: number;
    outputTokens: number;
    contextSize: number;
}

export interface RenderContext {
    data?: StatusJSON;
    tokenMetrics?: TokenMetrics | null;
    contextWindow?: ContextWindowInfo | null;  // Direct context info from Claude Code input
    sessionDuration?: string | null;
    blockMetrics?: BlockMetrics | null;
    terminalWidth?: number | null;
    isPreview?: boolean;
    lineIndex?: number;  // Index of the current line being rendered (for theme cycling)
    globalSeparatorIndex?: number;  // Global separator index that continues across lines
}