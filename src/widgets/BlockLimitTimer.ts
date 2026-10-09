import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatUsageDuration } from '../utils/usage';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    getUsageCompactKeybind,
    getUsageDisplayModifierText,
    isUsageCompact,
    toggleUsageCompact
} from './shared/usage-display';

const LABEL = 'Limit: ';
const PREVIEW_LIMIT_IN_MS = 73 * 60 * 1000;
// Rounded down like the reset timers, but never "0m": the limit hasn't been hit yet.
const MIN_SHOWN_MS = 60 * 1000;

export class BlockLimitTimerWidget implements Widget {
    getDefaultColor(): string { return 'red'; }
    getDescription(): string { return 'Time until the 5-hour block\'s limit at the current pace; shown only when that comes before the reset'; }
    getDisplayName(): string { return 'Block Limit Timer'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, { includeCompact: true })
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return action === 'toggle-compact' ? toggleUsageCompact(item) : null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const compact = isUsageCompact(item);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, LABEL, formatUsageDuration(PREVIEW_LIMIT_IN_MS, compact));
        }

        const limitInMs = context.sessionForecast?.limitInMs;
        if (limitInMs === null || limitInMs === undefined) {
            return null;
        }

        return formatRawOrLabeledValue(item, LABEL, formatUsageDuration(Math.max(MIN_SHOWN_MS, limitInMs), compact));
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [getUsageCompactKeybind()];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
