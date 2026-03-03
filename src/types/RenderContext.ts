import type { BlockMetrics } from '../types';

import type { ActivitySnapshot } from './Activity';
import type { StatusJSON } from './StatusJSON';
import type { TokenMetrics } from './TokenMetrics';

export interface RenderContext {
    data?: StatusJSON;
    tokenMetrics?: TokenMetrics | null;
    sessionDuration?: string | null;
    blockMetrics?: BlockMetrics | null;
    activity?: ActivitySnapshot | null;
    terminalWidth?: number | null;
    isPreview?: boolean;
    lineIndex?: number;  // Index of the current line being rendered (for theme cycling)
    globalSeparatorIndex?: number;  // Global separator index that continues across lines
}