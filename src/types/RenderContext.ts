import type { StatusJSON } from './StatusJSON';
import type { TokenMetrics } from './TokenMetrics';

export interface RenderContext {
    data?: StatusJSON;
    tokenMetrics?: TokenMetrics | null;
    sessionDuration?: string | null;
    gitBranch?: string | null;
    gitChanges?: { insertions: number; deletions: number } | null;
    terminalWidth?: number | null;
    isPreview?: boolean;
}