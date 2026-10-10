import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { TokenMetrics } from '../../types/TokenMetrics';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import { resolveNumberFormat } from '../../utils/number-format';
import { formatTokens } from '../../utils/renderer';
import {
    SUBAGENTS_MARKER,
    isWidgetSubagentsEnabled,
    withWidgetSubagentsEnabled
} from '../../utils/token-subagents';

import { isHidden } from './hideable';
import { formatRawOrLabeledValue } from './raw-or-labeled';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when token count is zero' };
const TOGGLE_SUBAGENTS_ACTION = 'toggle-subagents';

// The Tokens Input, Output, Cached and Total widgets show one labeled token
// count for the session. They differ in where the count comes from, and their
// label, name, color and preview sample. Each can opt in (s) to counting the
// session's subagent transcripts too, marked with a Σ before the label.
export abstract class TokenCountWidget implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    protected abstract readonly label: string;
    // The TUI preview's sample count
    protected abstract readonly previewTokens: number;
    // The session's count, or null when there's no data for it
    protected abstract getTokenCount(context: RenderContext): number | null;
    // This widget's count within a set of transcript metrics
    protected abstract selectTokens(metrics: TokenMetrics): number;

    getCategory(): string { return 'Tokens'; }
    getLabelPrefix(item?: WidgetItem): string {
        return item && isWidgetSubagentsEnabled(item) ? `${SUBAGENTS_MARKER}${this.label}` : this.label;
    }

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
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(item), formatTokens(this.previewTokens, format));
        }

        const tokens = this.getTokenCountForItem(item, context);
        if (tokens === null) {
            return null;
        }

        if (tokens === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatRawOrLabeledValue(item, this.getLabelPrefix(item), formatTokens(tokens, format));
    }

    // Subagent-inclusive metrics when the widget opts in (no fallback, since
    // the status JSON only covers the main session), main-only otherwise.
    private getTokenCountForItem(item: WidgetItem, context: RenderContext): number | null {
        if (!isWidgetSubagentsEnabled(item)) {
            return this.getTokenCount(context);
        }

        const metrics = context.sessionTokenMetrics;
        return metrics ? this.selectTokens(metrics) : null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{ key: 's', label: '(s)ubagents', action: TOGGLE_SUBAGENTS_ACTION }];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action !== TOGGLE_SUBAGENTS_ACTION) {
            return null;
        }

        return withWidgetSubagentsEnabled(item, !isWidgetSubagentsEnabled(item));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
