import type React from 'react';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { resolveNumberFormat } from '../utils/number-format';
import {
    formatUsageDuration,
    formatUsageResetAt,
    getUsageErrorMessage,
    resolveWeeklyUsageWindow
} from '../utils/usage';

import { makeModifierText } from './shared/editor-display';
import {
    CYCLE_GRADIENT_ACTION,
    cycleGradientPreset,
    getGradientModifier,
    paintsBarGradient
} from './shared/gradient-bar';
import { isHidden } from './shared/hideable';
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
    USAGE_NO_DATA_HIDEABLE_STATE,
    cycleUsageDisplayMode,
    formatUsageBar,
    getUsageDisplayMode,
    getUsageLocale,
    getUsageLocaleModifier,
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
    showsUsageBar,
    toggleUsageCompact,
    toggleUsageDateMode,
    toggleUsageHourFormat,
    toggleUsageInverted,
    toggleUsageWeekday
} from './shared/usage-display';

const LABEL = 'Weekly Reset: ';
const BAR_LABEL = 'Weekly Reset ';

const WEEKLY_PREVIEW_DURATION_MS = 36.5 * 60 * 60 * 1000;
const WEEKLY_RESET_PREVIEW_AT = '2026-03-15T08:30:00.000Z';
const USAGE_TIMER_LOADING_MESSAGE = '[Loading]';

function isWeeklyResetHoursOnly(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'hours');
}

function toggleWeeklyResetHoursOnly(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'hours');
}

function getWeeklyResetModifierText(item: WidgetItem): string | undefined {
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
    } else if (displayMode === 'line') {
        modifiers.push('line bar');
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
        } else if (isWeeklyResetHoursOnly(item)) {
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

    const gradientModifier = isBarMode ? getGradientModifier(item) : null;
    if (gradientModifier) {
        modifiers.push(gradientModifier);
    }

    return makeModifierText(modifiers);
}

export class WeeklyResetTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows time remaining until weekly usage reset'; }
    getDisplayName(): string { return 'Weekly Reset Timer'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(item: WidgetItem): string {
        const displayMode = getUsageDisplayMode(item);
        return isUsageProgressMode(displayMode) || isUsageSliderMode(displayMode) ? BAR_LABEL : LABEL;
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getWeeklyResetModifierText(item)
        };
    }

    getHideableStates(): HideableState[] {
        return [USAGE_NO_DATA_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_GRADIENT_ACTION) {
            return cycleGradientPreset(item);
        }

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
            return toggleWeeklyResetHoursOnly(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const inverted = isUsageInverted(item);
        const compact = isUsageCompact(item);
        const dateMode = isUsageDateMode(item);
        const useDays = !isWeeklyResetHoursOnly(item);
        const format = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            // Matches WEEKLY_PREVIEW_DURATION_MS: 36.5h of the 168h week left
            const previewPercent = inverted ? 21.7 : 78.3;

            const bar = formatUsageBar(item, previewPercent, format, settings);
            if (bar !== null) {
                return formatRawOrLabeledValue(item, this.getLabelPrefix(item), bar);
            }

            if (dateMode) {
                const weekday = isUsageWeekdayEnabled(item);
                const resetAt = formatUsageResetAt(
                    WEEKLY_RESET_PREVIEW_AT,
                    compact,
                    getUsageTimezone(item),
                    getUsageLocale(item),
                    isUsage12HourClock(item),
                    weekday
                );
                const fallback = weekday
                    ? (compact ? 'Sun 08:30Z' : 'Sun 08:30 UTC')
                    : (compact ? '03-15 08:30Z' : '2026-03-15 08:30 UTC');
                return formatRawOrLabeledValue(item, this.getLabelPrefix(item), resetAt ?? fallback);
            }

            return formatRawOrLabeledValue(item, this.getLabelPrefix(item), formatUsageDuration(WEEKLY_PREVIEW_DURATION_MS, compact, useDays));
        }

        const usageData = context.usageData ?? {};
        const window = resolveWeeklyUsageWindow(usageData);

        if (!window) {
            if (isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)) {
                return null;
            }

            if (usageData.error) {
                return getUsageErrorMessage(usageData.error);
            }

            return formatRawOrLabeledValue(item, this.getLabelPrefix(item), USAGE_TIMER_LOADING_MESSAGE);
        }

        const bar = formatUsageBar(item, inverted ? window.remainingPercent : window.elapsedPercent, format, settings);
        if (bar !== null) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(item), bar);
        }

        if (dateMode) {
            const timezone = getUsageTimezone(item);
            const locale = getUsageLocale(item);
            const resetAt = formatUsageResetAt(usageData.weeklyResetAt, compact, timezone, locale, isUsage12HourClock(item), isUsageWeekdayEnabled(item));
            if (resetAt) {
                return formatRawOrLabeledValue(item, this.getLabelPrefix(item), resetAt);
            }
        }

        const remainingTime = formatUsageDuration(window.remainingMs, compact, useDays);
        return formatRawOrLabeledValue(item, this.getLabelPrefix(item), remainingTime);
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
            keybinds.push({ key: 'o', label: '(o)nly hours', action: 'toggle-hours' });
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

    // A gradient preset paints only the bar, so the renderer colors the rest
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return paintsBarGradient(item, showsUsageBar(item));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
