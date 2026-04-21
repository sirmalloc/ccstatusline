import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getThresholdColor } from '../utils/colors';
import {
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
    toggleThresholdColors,
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

        if (action === 'toggle-threshold') {
            return toggleThresholdColors(item);
        }

        return null;
    }

    getEffectiveColor(context: RenderContext, item: WidgetItem): string | null {
        if (!isUsageProgressMode(getUsageDisplayMode(item))) {
            return null;
        }
        if (item.metadata?.thresholdColors === 'false') {
            return null;
        }

        const inverted = isUsageInverted(item);
        const lowThreshold = parseInt(item.metadata?.thresholdLow ?? '50', 10);
        const highThreshold = parseInt(item.metadata?.thresholdHigh ?? '80', 10);

        if (context.isPreview) {
            const previewPercent = 20;
            const renderedPercent = inverted ? 100 - previewPercent : previewPercent;
            return getThresholdColor(renderedPercent, lowThreshold, highThreshold);
        }

        const data = context.usageData ?? {};
        if (data.sessionUsage === undefined) {
            return null;
        }

        const percent = Math.max(0, Math.min(100, data.sessionUsage));
        const renderedPercent = inverted ? 100 - percent : percent;
        return getThresholdColor(renderedPercent, lowThreshold, highThreshold);
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
        if (data.error)
            return getUsageErrorMessage(data.error);
        if (data.sessionUsage === undefined)
            return null;

        const percent = Math.max(0, Math.min(100, data.sessionUsage));
        if (isUsageProgressMode(displayMode)) {
            const width = getUsageProgressBarWidth(displayMode);
            const renderedPercent = inverted ? 100 - percent : percent;
            const progressDisplay = `${makeUsageProgressBar(renderedPercent, width)} ${renderedPercent.toFixed(1)}%`;
            return formatRawOrLabeledValue(item, 'Session: ', progressDisplay);
        }

        return formatRawOrLabeledValue(item, 'Session: ', `${percent.toFixed(1)}%`);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}