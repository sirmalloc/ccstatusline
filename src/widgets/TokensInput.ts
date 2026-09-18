import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowInputTotalTokens } from '../utils/context-window';
import { resolveNumberFormat } from '../utils/number-format';
import { formatTokens } from '../utils/renderer';
import {
    SUBAGENTS_MARKER,
    isWidgetSubagentsEnabled,
    tokenMetricsForWidget,
    withWidgetSubagentsEnabled
} from '../utils/token-subagents';

import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when token count is zero' };

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

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        const subagents = isWidgetSubagentsEnabled(item);
        const label = subagents ? `${SUBAGENTS_MARKER}In: ` : 'In: ';
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, label, formatTokens(15200, format));
        }

        // The status JSON's context_window is main-agent only, so it is only a
        // fallback while this widget counts the main agent.
        const inputTotalTokens = tokenMetricsForWidget(item, context)?.inputTokens
            ?? (subagents ? null : getContextWindowInputTotalTokens(context.data))
            ?? null;
        if (inputTotalTokens === null) {
            return null;
        }

        if (inputTotalTokens === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatRawOrLabeledValue(item, label, formatTokens(inputTotalTokens, format));
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
    supportsNumberFormat(): boolean { return true; }
}
