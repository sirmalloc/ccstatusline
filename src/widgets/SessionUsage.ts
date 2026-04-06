import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getDetailLevel } from '../utils/detail-level';
import {
    formatUsageDuration,
    getUsageErrorMessage,
    makeUsageProgressBar
} from '../utils/usage';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsagePercentCustomKeybinds,
    getUsageProgressBarWidth,
    isUsageInverted,
    isUsageProgressMode,
    toggleUsageInverted
} from './shared/usage-display';

export class SessionUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows daily/session API usage percentage'; }
    getDisplayName(): string { return 'Session Usage'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getUsageDisplayMode(item);
        const inverted = isUsageInverted(item);

        if (context.isPreview) {
            const previewPercent = 20;
            const renderedPercent = inverted ? 100 - previewPercent : previewPercent;

            if (isUsageProgressMode(displayMode)) {
                const width = getUsageProgressBarWidth(displayMode);
                const progressDisplay = `${makeUsageProgressBar(renderedPercent, width)} ${renderedPercent.toFixed(1)}%`;
                return formatRawOrLabeledValue(item, 'Session: ', progressDisplay);
            }

            return formatRawOrLabeledValue(item, 'Session: ', `${previewPercent.toFixed(1)}%`);
        }

        const data = context.usageData ?? {};

        // Try prefetched data first, fall back to stdin rate_limits
        let percent: number | undefined;
        let resetSuffix = '';

        if (data.error || data.sessionUsage === undefined) {
            const stdinPercent = context.data?.rate_limits?.five_hour?.used_percentage;
            if (stdinPercent != null) {
                percent = Math.max(0, Math.min(100, stdinPercent));
                const resetsAt = context.data?.rate_limits?.five_hour?.resets_at;
                if (resetsAt != null) {
                    const remainingMs = resetsAt * 1000 - Date.now();
                    if (remainingMs > 0) {
                        resetSuffix = ` (resets ${formatUsageDuration(remainingMs)})`;
                    }
                }
            } else {
                // No stdin data either — show API error or null
                if (data.error) return getUsageErrorMessage(data.error);
                return null;
            }
        } else {
            percent = Math.max(0, Math.min(100, data.sessionUsage));
        }

        if (displayMode === 'progress' || displayMode === 'progress-short') {
            const renderedPercent = inverted ? 100 - percent : percent;
            const detail = getDetailLevel(context.terminalWidth);

            if (detail === 'narrow') {
                const text = `${Math.round(renderedPercent)}%`;
                return item.rawValue ? text : text;
            }

            if (detail === 'medium') {
                const compactReset = resetSuffix.replace(/\s*\(resets\s+/, ' (').replace(/hr /g, 'h').replace(/(\d+)m/, '$1m');
                const progressDisplay = `${makeUsageProgressBar(renderedPercent, 8)} ${Math.round(renderedPercent)}%${compactReset}`;
                return item.rawValue ? progressDisplay : progressDisplay;
            }

            const width = displayMode === 'progress' ? 32 : 16;
            const progressDisplay = `${makeUsageProgressBar(renderedPercent, width)} ${renderedPercent.toFixed(1)}%${resetSuffix}`;
            return item.rawValue ? progressDisplay : `Session: ${progressDisplay}`;
        }

        return item.rawValue ? `${percent.toFixed(1)}%${resetSuffix}` : `Session: ${percent.toFixed(1)}%${resetSuffix}`;
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
