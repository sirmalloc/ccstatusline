import type { RenderContext } from '../types/RenderContext';
import { getContextWindowOutputTotalTokens } from '../utils/context-window';

import { TokenCountWidget } from './shared/token-count-widget';

export class TokensOutputWidget extends TokenCountWidget {
    protected readonly label = 'Out: ';
    protected readonly previewTokens = 3400;

    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Shows output token count for the current session'; }
    getDisplayName(): string { return 'Tokens Output'; }

    protected getTokenCount(context: RenderContext): number | null {
        return context.tokenMetrics?.outputTokens
            ?? getContextWindowOutputTotalTokens(context.data)
            ?? null;
    }
}
