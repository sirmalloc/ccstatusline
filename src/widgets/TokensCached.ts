import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
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

export class TokensCachedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows cached token count for the current session'; }
    getDisplayName(): string { return 'Tokens Cached'; }
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
        const label = isWidgetSubagentsEnabled(item) ? `${SUBAGENTS_MARKER}Cached: ` : 'Cached: ';
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, label, formatTokens(12000, format));
        }

        // Subagent-inclusive metrics when the widget opts in, main-only otherwise.
        const metrics = tokenMetricsForWidget(item, context);
        if (metrics) {
            if (metrics.cachedTokens === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
                return null;
            }
            return formatRawOrLabeledValue(item, label, formatTokens(metrics.cachedTokens, format));
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
    supportsNumberFormat(): boolean { return true; }
}
