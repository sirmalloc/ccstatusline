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
    resolveUsageWindowWithFallback
} from '../utils/usage';

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
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsageLocale,
    getUsageProgressBarWidth,
    getUsageTimerCustomKeybinds,
    getUsageTimezone,
    isUsage12HourClock,
    isUsageCompact,
    isUsageDateMode,
    isUsageInverted,
    isUsageProgressMode,
    toggleUsageCompact,
    toggleUsageDateMode,
    toggleUsageHourFormat,
    toggleUsageInverted
} from './shared/usage-display';

function makeTimerProgressBar(percent: number, width: number): string {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const filledWidth = Math.floor((clampedPercent / 100) * width);
    const emptyWidth = width - filledWidth;
    return '█'.repeat(filledWidth) + '░'.repeat(emptyWidth);
}

const BLOCK_RESET_PREVIEW_AT = '2026-03-12T08:30:00.000Z';

export class BlockResetTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Shows time remaining until current 5hr block reset window'; }
    getDisplayName(): string { return 'Block Reset Timer'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, { includeCompact: true, includeDate: true })
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item, ['compact', 'absolute']);
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
        const displayMode = getUsageDisplayMode(item);
        const inverted = isUsageInverted(item);
        const compact = isUsageCompact(item);
        const dateMode = isUsageDateMode(item);

        if (context.isPreview) {
            const previewPercent = inverted ? 90.0 : 10.0;

            if (isUsageProgressMode(displayMode)) {
                const barWidth = getUsageProgressBarWidth(displayMode);
                const progressBar = makeTimerProgressBar(previewPercent, barWidth);
                return formatRawOrLabeledValue(item, 'Reset ', `[${progressBar}] ${previewPercent.toFixed(1)}%`);
            }

            if (dateMode) {
                const resetAt = formatUsageResetAt(
                    BLOCK_RESET_PREVIEW_AT,
                    compact,
                    getUsageTimezone(item),
                    getUsageLocale(item),
                    isUsage12HourClock(item)
                );
                return formatRawOrLabeledValue(item, 'Reset: ', resetAt ?? (compact ? '03-12 08:30Z' : '2026-03-12 08:30 UTC'));
            }

            return formatRawOrLabeledValue(item, 'Reset: ', compact ? '4h30m' : '4hr 30m');
        }

        const usageData = context.usageData ?? {};
        const window = resolveUsageWindowWithFallback(usageData, context.blockMetrics);

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
            return formatRawOrLabeledValue(item, 'Reset ', `[${progressBar}] ${percentage}%`);
        }

        if (dateMode) {
            const timezone = getUsageTimezone(item);
            const locale = getUsageLocale(item);
            const resetAt = formatUsageResetAt(usageData.sessionResetAt, compact, timezone, locale, isUsage12HourClock(item));
            if (resetAt) {
                return formatRawOrLabeledValue(item, 'Reset: ', resetAt);
            }
        }

        const remainingTime = formatUsageDuration(window.remainingMs, compact);
        return formatRawOrLabeledValue(item, 'Reset: ', remainingTime);
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

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
