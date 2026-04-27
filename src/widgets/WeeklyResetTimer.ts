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
    formatUsageResetAt,
    getUsageErrorMessage,
    resolveWeeklyUsageWindow
} from '../utils/usage';

import { makeModifierText } from './shared/editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageProgressBarWidth,
    getUsageTimerCustomKeybinds,
    isUsageCompact,
    isUsageDateMode,
    isUsageInverted,
    isUsageProgressMode,
    toggleUsageCompact,
    toggleUsageDateMode,
    toggleUsageInverted
} from './shared/usage-display';

function makeTimerProgressBar(percent: number, width: number): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.floor((clampedPercent / 100) * width);
    const emptyWidth = width - filledWidth;
    return '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
}

const WEEKLY_PREVIEW_DURATION_MS = 36.5 * 60 * 60 * 1000;

function isWeeklyResetHoursOnly(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'hours');
}

function toggleWeeklyResetHoursOnly(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'hours');
}

function getWeeklyResetModifierText(item: WidgetItem): string | undefined {
    const displayMode = getUsageDisplayMode(item);
    const dateMode = isUsageDateMode(item);
    const modifiers: string[] = [];

    if (displayMode === 'progress') {
        modifiers.push('long bar');
    } else if (displayMode === 'progress-short') {
        modifiers.push('medium bar');
    }

    if (isUsageInverted(item)) {
        modifiers.push('inverted');
    }

    if (!isUsageProgressMode(displayMode)) {
        if (isUsageCompact(item)) {
            modifiers.push('compact');
        }

        if (dateMode) {
            modifiers.push('date');
        } else if (isWeeklyResetHoursOnly(item)) {
            modifiers.push('hours only');
        }
    }

    return makeModifierText(modifiers);
}

export class WeeklyResetTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows time remaining until weekly usage reset'; }
    getDisplayName(): string { return 'Weekly Reset Timer'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getWeeklyResetModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item, ['compact', 'hours', 'absolute']);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        if (action === 'toggle-compact') {
            return toggleUsageCompact(item);
        }

        if (action === 'toggle-date') {
            return toggleUsageDateMode(item);
        }

        if (action === 'toggle-hours') {
            return toggleWeeklyResetHoursOnly(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getUsageDisplayMode(item);
        const inverted = isUsageInverted(item);
        const compact = isUsageCompact(item);
        const dateMode = isUsageDateMode(item);
        const useDays = !isWeeklyResetHoursOnly(item);

        if (context.isPreview) {
            const previewPercent = inverted ? 90.0 : 10.0;

            if (isUsageProgressMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const progressBar = makeTimerProgressBar(previewPercent, barWidth);
                return formatRawOrLabeledValue(item, 'Weekly Reset ', `[${progressBar}] ${previewPercent.toFixed(1)}%`);
            }

            if (dateMode) {
                return formatRawOrLabeledValue(item, 'Weekly Reset: ', compact ? '03-15 08:30Z' : '2026-03-15 08:30 UTC');
            }

            return formatRawOrLabeledValue(item, 'Weekly Reset: ', formatUsageDuration(WEEKLY_PREVIEW_DURATION_MS, compact, useDays));
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

        if (dateMode) {
            const resetAt = formatUsageResetAt(usageData.weeklyResetAt, compact);
            if (resetAt) {
                return formatRawOrLabeledValue(item, 'Weekly Reset: ', resetAt);
            }
        }

        const remainingTime = formatUsageDuration(window.remainingMs, compact, useDays);
        return formatRawOrLabeledValue(item, 'Weekly Reset: ', remainingTime);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds = getUsageTimerCustomKeybinds(item, { includeDate: true });

        if (!item || (!isUsageProgressMode(getUsageDisplayMode(item)) && !isUsageDateMode(item))) {
            keybinds.push({ key: 'h', label: '(h)ours only', action: 'toggle-hours' });
        }

        return keybinds;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
