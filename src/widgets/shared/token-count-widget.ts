import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import { resolveNumberFormat } from '../../utils/number-format';
import { formatTokens } from '../../utils/renderer';

import { isHidden } from './hideable';
import { formatRawOrLabeledValue } from './raw-or-labeled';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when token count is zero' };

// The Tokens Input, Output, Cached and Total widgets show one labeled token
// count for the session. They differ in where the count comes from, and their
// label, name, color and preview sample.
export abstract class TokenCountWidget implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    protected abstract readonly label: string;
    // The TUI preview's sample count
    protected abstract readonly previewTokens: number;
    // The session's count, or null when there's no data for it
    protected abstract getTokenCount(context: RenderContext): number | null;

    getCategory(): string { return 'Tokens'; }
    getLabelPrefix(): string { return this.label; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatTokens(this.previewTokens, format));
        }

        const tokens = this.getTokenCount(context);
        if (tokens === null) {
            return null;
        }

        if (tokens === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatRawOrLabeledValue(item, this.getLabelPrefix(), formatTokens(tokens, format));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
