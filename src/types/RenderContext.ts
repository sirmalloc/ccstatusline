import type { StatusJSON } from './StatusJSON';
import type { TokenMetrics } from './TokenMetrics';

export interface RenderContext {
    data?: StatusJSON;
    tokenMetrics?: TokenMetrics | null;
    sessionDuration?: string | null;
    terminalWidth?: number | null;
    isPreview?: boolean;
}