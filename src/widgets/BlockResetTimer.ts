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
    resolveUsageWindowWithFallback
} from '../utils/usage';

import {
    CYCLE_GRADIENT_ACTION,
    cycleGradientPreset,
    paintsBarGradient
} from './shared/gradient-bar';
import { isHidden } from './shared/hideable';
import {
    LOCALE_EDITOR_ACTION,
    renderUsageLocaleEditor
} from './shared/locale-editor';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    TIMEZONE_EDITOR_ACTION,
    renderUsageTimezoneEditor
} from './shared/timezone-editor';
import {
    SESSION_UNDER_LIMIT_HIDEABLE_STATE,
    USAGE_NO_DATA_HIDEABLE_STATE,
    cycleUsageDisplayMode,
    formatUsageBar,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsageLocale,
    getUsageTimerCustomKeybinds,
    getUsageTimezone,
    isAtSessionLimit,
    isUsage12HourClock,
    isUsageCompact,
    isUsageDateMode,
    isUsageInverted,
    isUsageProgressMode,
    isUsageSliderMode,
    showsUsageBar,
    toggleUsageCompact,
    toggleUsageDateMode,
    toggleUsageHourFormat,
    toggleUsageInverted
} from './shared/usage-display';

const LABEL = 'Reset: ';
const BAR_LABEL = 'Reset ';

const BLOCK_RESET_PREVIEW_AT = '2026-03-12T08:30:00.000Z';
const USAGE_TIMER_LOADING_MESSAGE = '[Loading]';

export class BlockResetTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows time remaining until current 5hr block reset window'; }
    getDisplayName(): string { return 'Block Reset Timer'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(item: WidgetItem): string {
        const displayMode = getUsageDisplayMode(item);
        return isUsageProgressMode(displayMode) || isUsageSliderMode(displayMode) ? BAR_LABEL : LABEL;
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, { includeCompact: true, includeDate: true })
        };
    }

    getHideableStates(): HideableState[] {
        return [USAGE_NO_DATA_HIDEABLE_STATE, SESSION_UNDER_LIMIT_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_GRADIENT_ACTION) {
            return cycleGradientPreset(item);
        }

        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item, ['compact', 'absolute'], true);
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

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const inverted = isUsageInverted(item);
        const compact = isUsageCompact(item);
        const dateMode = isUsageDateMode(item);
        const format = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            const previewPercent = inverted ? 15.0 : 85.0;

            const bar = formatUsageBar(item, previewPercent, format, settings);
            if (bar !== null) {
                return formatRawOrLabeledValue(item, this.getLabelPrefix(item), bar);
            }

            if (dateMode) {
                const resetAt = formatUsageResetAt(
                    BLOCK_RESET_PREVIEW_AT,
                    compact,
                    getUsageTimezone(item),
                    getUsageLocale(item),
                    isUsage12HourClock(item)
                );
                return formatRawOrLabeledValue(item, this.getLabelPrefix(item), resetAt ?? (compact ? '03-12 08:30Z' : '2026-03-12 08:30 UTC'));
            }

            return formatRawOrLabeledValue(item, this.getLabelPrefix(item), '45m');
        }

        const usageData = context.usageData ?? {};
        if (!isAtSessionLimit(context) && isHidden(item, SESSION_UNDER_LIMIT_HIDEABLE_STATE.key)) {
            return null;
        }
        const nowMs = Date.now();
        const window = resolveUsageWindowWithFallback(usageData, context.blockMetrics, nowMs);

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
            // A window from transcript blocks has no reported reset time, but
            // its reset is just as known: the end of the block
            const sessionResetAt = usageData.sessionResetAt ?? new Date(nowMs + window.remainingMs).toISOString();
            const resetAt = formatUsageResetAt(sessionResetAt, compact, timezone, locale, isUsage12HourClock(item));
            if (resetAt) {
                return formatRawOrLabeledValue(item, this.getLabelPrefix(item), resetAt);
            }
        }

        const remainingTime = formatUsageDuration(window.remainingMs, compact);
        return formatRawOrLabeledValue(item, this.getLabelPrefix(item), remainingTime);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsageTimerCustomKeybinds(item, {
            includeDate: true,
            includeHourFormat: true,
            includeLocale: true,
            includeTimezone: true
        });
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
