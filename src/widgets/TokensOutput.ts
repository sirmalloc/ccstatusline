import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowOutputTotalTokens } from '../utils/context-window';
import { formatTokens } from '../utils/renderer';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class TokensOutputWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Shows output token count for the current session'; }
    getDisplayName(): string { return 'Tokens Output'; }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Out: ', '3.4k');
        }

        const outputTotalTokens = getContextWindowOutputTotalTokens(context.data);
        if (outputTotalTokens !== null) {
            return formatRawOrLabeledValue(item, 'Out: ', formatTokens(outputTotalTokens));
        }

        if (context.tokenMetrics) {
            return formatRawOrLabeledValue(item, 'Out: ', formatTokens(context.tokenMetrics.outputTokens));
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}