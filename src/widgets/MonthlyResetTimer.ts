import type React from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    formatUsageDuration,
    formatUsageResetAt,
    getUsageErrorMessage,
    resolveMonthlyUsageWindow
} from '../utils/usage';

import { makeModifierText } from './shared/editor-display';
import {
    LOCALE_EDITOR_ACTION,
    renderUsageLocaleEditor
} from './shared/locale-editor';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    TIMEZONE_EDITOR_ACTION,
    renderUsageTimezoneEditor
} from './shared/timezone-editor';
import {
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageLocale,
    getUsageLocaleModifier,
    getUsageProgressBarWidth,
    getUsageTimerCustomKeybinds,
    getUsageTimezone,
    getUsageTimezoneModifier,
    isUsage12HourClock,
    isUsageCompact,
    isUsageDateMode,
    isUsageInverted,
    isUsageProgressMode,
    isUsageSliderMode,
    isUsageWeekdayEnabled,
    makeSliderBar,
    toggleUsageCompact,
    toggleUsageDateMode,
    toggleUsageHourFormat,
    toggleUsageInverted,
    toggleUsageWeekday
} from './shared/usage-display';

function makeTimerProgressBar(percent: number, width: number): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.floor((clampedPercent / 100) * width);
    const emptyWidth = width - filledWidth;
    return '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
}

const MONTHLY_PREVIEW_DURATION_MS = 20 * 24 * 60 * 60 * 1000;
const MONTHLY_RESET_PREVIEW_AT = '2026-04-15T08:30:00.000Z';
const USAGE_TIMER_LOADING_MESSAGE = '[Loading]';

function isMonthlyResetHoursOnly(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'hours');
}

function toggleMonthlyResetHoursOnly(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'hours');
}

function getMonthlyResetModifierText(item: WidgetItem): string | undefined {
    const displayMode = getUsageDisplayMode(item);
    const dateMode = isUsageDateMode(item);
    const isBarMode = isUsageProgressMode(displayMode) || isUsageSliderMode(displayMode);
    const modifiers: string[] = [];

    if (displayMode === 'progress') {
        modifiers.push('long bar');
    } else if (displayMode === 'progress-short') {
        modifiers.push('medium bar');
    } else if (displayMode === 'slider') {
        modifiers.push('short bar');
    } else if (displayMode === 'slider-only') {
        modifiers.push('short bar only');
    }

    if (isUsageInverted(item)) {
        modifiers.push('inverted');
    }

    if (!isBarMode) {
        if (isUsageCompact(item)) {
            modifiers.push('compact');
        }

        if (dateMode) {
            modifiers.push('date');

            if (isUsage12HourClock(item)) {
                modifiers.push('12hr');
            }

            if (isUsageWeekdayEnabled(item)) {
                modifiers.push('weekday');
            }
        } else if (isMonthlyResetHoursOnly(item)) {
            modifiers.push('hours only');
        }
    }

    const timezoneModifier = getUsageTimezoneModifier(item);
    if (!isBarMode && dateMode && timezoneModifier) {
        modifiers.push(timezoneModifier);
    }

    const localeModifier = getUsageLocaleModifier(item);
    if (!isBarMode && dateMode && localeModifier) {
        modifiers.push(localeModifier);
    }

    return makeModifierText(modifiers);
}

export class MonthlyResetTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightMagenta'; }
    getDescription(): string { return 'Shows time remaining until monthly token quota reset (ZAI/GLM Coding Plan)'; }
    getDisplayName(): string { return 'Monthly Reset Timer'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getMonthlyResetModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item, ['compact', 'hours', 'absolute'], true);
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

        if (action === 'toggle-hour-format') {
            return toggleUsageHourFormat(item);
        }

        if (action === 'toggle-weekday') {
            return toggleUsageWeekday(item);
        }

        if (action === 'toggle-hours') {
            return toggleMonthlyResetHoursOnly(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getUsageDisplayMode(item);
        const inverted = isUsageInverted(item);
        const compact = isUsageCompact(item);
        const dateMode = isUsageDateMode(item);
        const useDays = !isMonthlyResetHoursOnly(item);

        if (context.isPreview) {
            const previewPercent = inverted ? 90.0 : 10.0;

            if (isUsageProgressMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const progressBar = makeTimerProgressBar(previewPercent, barWidth);
                return formatRawOrLabeledValue(item, 'Monthly Reset ', `[${progressBar}] ${previewPercent.toFixed(1)}%`);
            }

            if (isUsageSliderMode(displayMode)) {
                const slider = makeSliderBar(previewPercent);
                const sliderDisplay = displayMode === 'slider'
                    ? `${slider} ${previewPercent.toFixed(1)}%`
                    : slider;
                return formatRawOrLabeledValue(item, 'Monthly Reset ', sliderDisplay);
            }

            if (dateMode) {
                const weekday = isUsageWeekdayEnabled(item);
                const resetAt = formatUsageResetAt(
                    MONTHLY_RESET_PREVIEW_AT,
                    compact,
                    getUsageTimezone(item),
                    getUsageLocale(item),
                    isUsage12HourClock(item),
                    weekday
                );
                const fallback = weekday
                    ? (compact ? 'Wed 08:30Z' : 'Wed 08:30 UTC')
                    : (compact ? '04-15 08:30Z' : '2026-04-15 08:30 UTC');
                return formatRawOrLabeledValue(item, 'Monthly Reset: ', resetAt ?? fallback);
            }

            return formatRawOrLabeledValue(item, 'Monthly Reset: ', formatUsageDuration(MONTHLY_PREVIEW_DURATION_MS, compact, useDays));
        }

        const usageData = context.usageData ?? {};
        const window = resolveMonthlyUsageWindow(usageData);

        if (!window) {
            if (usageData.error) {
                return getUsageErrorMessage(usageData.error);
            }

            return formatRawOrLabeledValue(item, 'Monthly Reset: ', USAGE_TIMER_LOADING_MESSAGE);
        }

        if (isUsageProgressMode(displayMode)) {
            const barWidth = getUsageProgressBarWidth(displayMode);
            const percent = inverted ? window.remainingPercent : window.elapsedPercent;
            const progressBar = makeTimerProgressBar(percent, barWidth);
            const percentage = percent.toFixed(1);
            return formatRawOrLabeledValue(item, 'Monthly Reset ', `[${progressBar}] ${percentage}%`);
        }

        if (isUsageSliderMode(displayMode)) {
            const percent = inverted ? window.remainingPercent : window.elapsedPercent;
            const slider = makeSliderBar(percent);
            const sliderDisplay = displayMode === 'slider'
                ? `${slider} ${percent.toFixed(1)}%`
                : slider;
            return formatRawOrLabeledValue(item, 'Monthly Reset ', sliderDisplay);
        }

        if (dateMode) {
            const timezone = getUsageTimezone(item);
            const locale = getUsageLocale(item);
            const resetAt = formatUsageResetAt(usageData.monthlyResetAt, compact, timezone, locale, isUsage12HourClock(item), isUsageWeekdayEnabled(item));
            if (resetAt) {
                return formatRawOrLabeledValue(item, 'Monthly Reset: ', resetAt);
            }
        }

        const remainingTime = formatUsageDuration(window.remainingMs, compact, useDays);
        return formatRawOrLabeledValue(item, 'Monthly Reset: ', remainingTime);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds = getUsageTimerCustomKeybinds(item, {
            includeDate: true,
            includeHourFormat: true,
            includeWeekday: true,
            includeLocale: true,
            includeTimezone: true
        });

        const mode = item ? getUsageDisplayMode(item) : 'time';
        const isBarMode = isUsageProgressMode(mode) || isUsageSliderMode(mode);
        if (!item || (!isBarMode && !isUsageDateMode(item))) {
            keybinds.push({ key: 'h', label: '(h)ours only', action: 'toggle-hours' });
        }

        return keybinds;
    }

    renderEditor(props: WidgetEditorProps): React.ReactElement | null {
        if (props.action === LOCALE_EDITOR_ACTION) {
            return renderUsageLocaleEditor(props);
        }

        if (props.action === TIMEZONE_EDITOR_ACTION) {
            return renderUsageTimezoneEditor(props);
        }

        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
