import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/renderer';
import {
    SUBAGENTS_MARKER,
    isWidgetSubagentsEnabled,
    tokenMetricsForWidget,
    withWidgetSubagentsEnabled
} from '../utils/token-subagents';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class TokensTotalWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows total token count (input + output + cache) for the current session'; }
    getDisplayName(): string { return 'Tokens Total'; }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return isWidgetSubagentsEnabled(item)
            ? { displayText: this.getDisplayName(), modifierText: '[+sub]' }
            : { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const subagents = isWidgetSubagentsEnabled(item);
        const label = subagents ? `${SUBAGENTS_MARKER}Total: ` : 'Total: ';

        if (context.isPreview) {
            return formatRawOrLabeledValue(item, label, '30.6k');
        }

        const metrics = tokenMetricsForWidget(item, context);
        if (metrics) {
            return formatRawOrLabeledValue(item, label, formatTokens(metrics.totalTokens));
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
