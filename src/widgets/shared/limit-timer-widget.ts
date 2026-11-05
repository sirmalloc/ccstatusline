import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import { formatUsageDuration } from '../../utils/usage';

import { formatRawOrLabeledValue } from './raw-or-labeled';
import {
    getUsageCompactKeybind,
    getUsageTextModifierText,
    isUsageCompact,
    toggleUsageCompact
} from './usage-display';

// Rounded down like the reset timers, but never "0m": the limit hasn't been hit yet.
const MIN_SHOWN_MS = 60 * 1000;

// The limit timers show how long until a usage window's limit at the current
// pace, and nothing when the pace reaches it only after the reset. They differ
// in the window, how its pace is measured, the label and the preview sample.
export abstract class LimitTimerWidget implements Widget {
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    protected abstract readonly label: string;
    // The TUI preview's sample, in milliseconds
    protected abstract readonly previewLimitInMs: number;
    // Milliseconds until the limit, or null when it comes after the reset or
    // there's nothing to measure
    protected abstract getLimitInMs(context: RenderContext): number | null;

    getDefaultColor(): string { return 'red'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return this.label; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageTextModifierText(item, { includeCompact: true })
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return action === 'toggle-compact' ? toggleUsageCompact(item) : null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const compact = isUsageCompact(item);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, this.label, formatUsageDuration(this.previewLimitInMs, compact));
        }

        const limitInMs = this.getLimitInMs(context);
        if (limitInMs === null) {
            return null;
        }

        return formatRawOrLabeledValue(item, this.label, formatUsageDuration(Math.max(MIN_SHOWN_MS, limitInMs), compact));
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getUsageCompactKeybind()];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
