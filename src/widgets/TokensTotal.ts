import type { RenderContext } from '../types/RenderContext';

import { TokenCountWidget } from './shared/token-count-widget';

export class TokensTotalWidget extends TokenCountWidget {
    protected readonly label = 'Total: ';
    protected readonly previewTokens = 30600;

    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows total token count (input + output + cache) for the current session'; }
    getDisplayName(): string { return 'Tokens Total'; }

    protected getTokenCount(context: RenderContext): number | null {
        return context.tokenMetrics?.totalTokens ?? null;
    }
}
