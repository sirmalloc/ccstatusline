import type { RenderContext } from '../types/RenderContext';
import { getContextWindowInputTotalTokens } from '../utils/context-window';

import { TokenCountWidget } from './shared/token-count-widget';

export class TokensInputWidget extends TokenCountWidget {
    protected readonly label = 'In: ';
    protected readonly previewTokens = 15200;

    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows input token count for the current session'; }
    getDisplayName(): string { return 'Tokens Input'; }

    protected getTokenCount(context: RenderContext): number | null {
        return context.tokenMetrics?.inputTokens
            ?? getContextWindowInputTotalTokens(context.data)
            ?? null;
    }
}
