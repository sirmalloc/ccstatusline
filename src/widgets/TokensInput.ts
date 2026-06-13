import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowInputTotalTokens } from '../utils/context-window';
import { formatTokens } from '../utils/renderer';
import {
    SUBAGENTS_MARKER,
    isWidgetSubagentsEnabled,
    tokenMetricsForWidget,
    withWidgetSubagentsEnabled
} from '../utils/token-subagents';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class TokensInputWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows input token count for the current session'; }
    getDisplayName(): string { return 'Tokens Input'; }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return isWidgetSubagentsEnabled(item)
            ? { displayText: this.getDisplayName(), modifierText: '[+sub]' }
            : { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const subagents = isWidgetSubagentsEnabled(item);
        const label = subagents ? `${SUBAGENTS_MARKER}In: ` : 'In: ';

        if (context.isPreview) {
            return formatRawOrLabeledValue(item, label, '15.2k');
        }

        // The stdin context_window payload is main-only; skip it when subagents are on.
        if (!subagents) {
            const inputTotalTokens = getContextWindowInputTotalTokens(context.data);
            if (inputTotalTokens !== null) {
                return formatRawOrLabeledValue(item, label, formatTokens(inputTotalTokens));
            }
        }

        const metrics = tokenMetricsForWidget(item, context);
        if (metrics) {
            return formatRawOrLabeledValue(item, label, formatTokens(metrics.inputTokens));
        }
        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{ key: 's', label: '(s)ubagents', action: 'toggle-subagents' }];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action !== 'toggle-subagents') {
            return null;
        }
        return withWidgetSubagentsEnabled(item, !isWidgetSubagentsEnabled(item));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
