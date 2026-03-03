import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    fetchUsageData,
    formatUsageDuration,
    resolveUsageWindowWithFallback
} from '../utils/usage';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsageProgressBarWidth,
    isUsageInverted,
    isUsageProgressMode,
    toggleUsageInverted
} from './shared/usage-display';

function makeTimerProgressBar(percent: number, width: number): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.floor((clampedPercent / 100) * width);
    const emptyWidth = width - filledWidth;
    return '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
}

export class BlockTimerWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows current 5hr block elapsed time or progress'; }
    getDisplayName(): string { return 'Block Timer'; }
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
            const previewPercent = inverted ? 26.1 : 73.9;

            if (isUsageProgressMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const progressBar = makeTimerProgressBar(previewPercent, barWidth);
                return formatRawOrLabeledValue(item, 'Block ', `[${progressBar}] ${previewPercent.toFixed(1)}%`);
            }

            return formatRawOrLabeledValue(item, 'Block: ', '3hr 45m');
        }

        const usageData = fetchUsageData();
        const window = resolveUsageWindowWithFallback(usageData, context.blockMetrics);

        if (!window) {
            if (isUsageProgressMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const emptyBar = '░'.repeat(barWidth);
                return formatRawOrLabeledValue(item, 'Block ', `[${emptyBar}] 0.0%`);
            }

            return formatRawOrLabeledValue(item, 'Block: ', '0hr 0m');
        }

        if (isUsageProgressMode(displayMode)) {
            const barWidth = getUsageProgressBarWidth(displayMode);
            const percent = inverted ? window.remainingPercent : window.elapsedPercent;
            const progressBar = makeTimerProgressBar(percent, barWidth);
            const percentage = percent.toFixed(1);
            return formatRawOrLabeledValue(item, 'Block ', `[${progressBar}] ${percentage}%`);
        }

        const elapsedTime = formatUsageDuration(window.elapsedMs);
        return formatRawOrLabeledValue(item, 'Block: ', elapsedTime);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}