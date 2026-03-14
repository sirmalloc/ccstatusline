import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatUsageDuration,
    formatUsageDurationDaysHours,
    getUsageErrorMessage,
    resolveWeeklyUsageWindow
} from '../utils/usage';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsageProgressBarWidth,
    isUsageCompact,
    isUsageDaysHours,
    isUsageInverted,
    isUsageProgressMode,
    toggleUsageCompact,
    toggleUsageDaysHours,
    toggleUsageInverted
} from './shared/usage-display';

function makeTimerProgressBar(percent: number, width: number): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.floor((clampedPercent / 100) * width);
    const emptyWidth = width - filledWidth;
    return '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
}

export class WeeklyResetTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows time remaining until weekly usage reset'; }
    getDisplayName(): string { return 'Weekly Reset Timer'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, { includeCompact: true, includeDaysHours: true })
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        if (action === 'toggle-compact') {
            return toggleUsageCompact(item);
        }

        if (action === 'toggle-days-hours') {
            return toggleUsageDaysHours(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getUsageDisplayMode(item);
        const inverted = isUsageInverted(item);
        const compact = isUsageCompact(item);
        const daysHours = isUsageDaysHours(item);

        if (context.isPreview) {
            const previewPercent = inverted ? 90.0 : 10.0;

            if (isUsageProgressMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const progressBar = makeTimerProgressBar(previewPercent, barWidth);
                return formatRawOrLabeledValue(item, 'Weekly Reset ', `[${progressBar}] ${previewPercent.toFixed(1)}%`);
            }

            if (daysHours) {
                return formatRawOrLabeledValue(item, 'Weekly Reset: ', '1d 12hr');
            }

            return formatRawOrLabeledValue(item, 'Weekly Reset: ', compact ? '36h30m' : '36hr 30m');
        }

        const usageData = context.usageData ?? {};
        const window = resolveWeeklyUsageWindow(usageData);

        if (!window) {
            if (usageData.error) {
                return getUsageErrorMessage(usageData.error);
            }

            return null;
        }

        if (isUsageProgressMode(displayMode)) {
            const barWidth = getUsageProgressBarWidth(displayMode);
            const percent = inverted ? window.remainingPercent : window.elapsedPercent;
            const progressBar = makeTimerProgressBar(percent, barWidth);
            const percentage = percent.toFixed(1);
            return formatRawOrLabeledValue(item, 'Weekly Reset ', `[${progressBar}] ${percentage}%`);
        }

        const remainingTime = daysHours
            ? formatUsageDurationDaysHours(window.remainingMs)
            : formatUsageDuration(window.remainingMs, compact);
        return formatRawOrLabeledValue(item, 'Weekly Reset: ', remainingTime);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' },
            { key: 's', label: '(s)hort time', action: 'toggle-compact' },
            { key: 'y', label: 'da(y)s+hours', action: 'toggle-days-hours' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}