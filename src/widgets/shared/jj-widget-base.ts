import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import { isInsideJjRepo } from '../../utils/jj';

import {
    NO_JJ_HIDEABLE_STATE,
    isHidden
} from './hideable';

// The Jujutsu widgets each read one value with their own jj command and format
// it; the TUI preview formats a sample the same way. Outside a jj repo, or when
// the command reads nothing, they show a placeholder, which the no-jj hide
// state drops. They differ in the command, the formatting and the placeholder.
export abstract class JjWidgetBase<T = string> implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;
    abstract supportsRawValue(): boolean;

    // The TUI preview's sample
    protected abstract readonly previewValue: T;
    // The placeholder outside a jj repo, and when the command reads nothing
    protected abstract readonly noJjText: string;
    // A different placeholder for when the command reads nothing
    protected readonly emptyText?: string;

    // Runs the widget's jj command; null when it reads nothing
    protected abstract getValue(context: RenderContext): T | null;
    protected abstract formatValue(item: WidgetItem, value: T): string;

    getCategory(): string { return 'Jujutsu'; }

    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_JJ_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return this.formatValue(item, this.previewValue);
        }

        const hideNoJj = isHidden(item, NO_JJ_HIDEABLE_STATE.key);
        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : this.formatPlaceholder(item, this.noJjText);
        }

        const value = this.getValue(context);
        if (value !== null) {
            return this.formatValue(item, value);
        }

        return hideNoJj ? null : this.formatPlaceholder(item, this.emptyText ?? this.noJjText);
    }

    supportsColors(_item: WidgetItem): boolean { return true; }

    // Plain text by default; a widget can label its placeholders, e.g. with its glyph
    protected formatPlaceholder(_item: WidgetItem, text: string): string {
        return text;
    }
}
