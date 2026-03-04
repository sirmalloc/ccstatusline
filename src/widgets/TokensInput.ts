import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowInputTotalTokens } from '../utils/context-window';
import { formatTokens } from '../utils/renderer';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class TokensInputWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows input token count for the current session'; }
    getDisplayName(): string { return 'Tokens Input'; }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'In: ', '15.2k');
        }

        const inputTotalTokens = getContextWindowInputTotalTokens(context.data);
        if (inputTotalTokens !== null) {
            return formatRawOrLabeledValue(item, 'In: ', formatTokens(inputTotalTokens));
        }

        if (context.tokenMetrics) {
            return formatRawOrLabeledValue(item, 'In: ', formatTokens(context.tokenMetrics.inputTokens));
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}