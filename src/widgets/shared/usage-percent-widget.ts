import type { NumberFormat } from '../../types/NumberFormat';
import type {
    RenderContext,
    RenderUsageData
} from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../../utils/number-format';
import {
    getUsageErrorMessage,
    resolveFableUsageWindow,
    resolveUsageWindowWithFallback,
    resolveWeeklyOpusUsageWindow,
    resolveWeeklySonnetUsageWindow,
    resolveWeeklyUsageWindow
} from '../../utils/usage';
import type { UsageWindowMetrics } from '../../utils/usage-types';

import { isHidden } from './hideable';
import { makeTimerProgressBar } from './progress-bar';
import { formatRawOrLabeledValue } from './raw-or-labeled';
import {
    USAGE_NO_DATA_HIDEABLE_STATE,
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsageProgressBarWidth,
    isUsageCursorEnabled,
    isUsageInverted,
    isUsageProgressMode,
    isUsageSliderMode,
    makeSliderBar,
    toggleUsageCursor,
    toggleUsageInverted
} from './usage-display';

export type UsagePercentWidgetKind = 'session' | 'weekly' | 'weekly-sonnet' | 'weekly-opus' | 'fable-weekly';

type UsagePercentField = 'sessionUsage' | 'weeklyUsage' | 'weeklySonnetUsage' | 'weeklyOpusUsage' | 'fableUsage';

interface UsageCursorOptions { cursorPercent: number }

interface UsagePercentWidgetKindConfig {
    label: string;
    displayName: string;
    description: string;
    previewPercent: number;
    usageField: UsagePercentField;
}

const USAGE_PERCENT_WIDGET_CONFIG: Record<UsagePercentWidgetKind, UsagePercentWidgetKindConfig> = {
    'session': {
        label: 'Session: ',
        displayName: 'Session Usage',
        description: 'Shows daily/session API usage percentage',
        previewPercent: 20,
        usageField: 'sessionUsage'
    },
    'weekly': {
        label: 'Weekly: ',
        displayName: 'Weekly Usage',
        description: 'Shows weekly API usage percentage',
        previewPercent: 12,
        usageField: 'weeklyUsage'
    },
    'weekly-sonnet': {
        label: 'Weekly Sonnet: ',
        displayName: 'Weekly Sonnet Usage',
        description: 'Shows weekly Sonnet API usage percentage',
        previewPercent: 8,
        usageField: 'weeklySonnetUsage'
    },
    'weekly-opus': {
        label: 'Weekly Opus: ',
        displayName: 'Weekly Opus Usage',
        description: 'Shows weekly Opus API usage percentage',
        previewPercent: 4,
        usageField: 'weeklyOpusUsage'
    },
    'fable-weekly': {
        label: 'Weekly Fable: ',
        displayName: 'Weekly Fable Usage',
        description: 'Shows Fable-only weekly usage percentage',
        previewPercent: 4,
        usageField: 'fableUsage'
    }
};

// The session window also consults block metrics, so the resolvers take different
// arguments and are picked per call rather than stored alongside the config.
function resolveUsageWindow(kind: UsagePercentWidgetKind, data: RenderUsageData, context: RenderContext): UsageWindowMetrics | null {
    if (kind === 'session') {
        return resolveUsageWindowWithFallback(data, context.blockMetrics);
    }
    if (kind === 'weekly') {
        return resolveWeeklyUsageWindow(data);
    }
    if (kind === 'weekly-sonnet') {
        return resolveWeeklySonnetUsageWindow(data);
    }
    if (kind === 'weekly-opus') {
        return resolveWeeklyOpusUsageWindow(data);
    }
    return resolveFableUsageWindow(data);
}

function renderUsageDisplay(
    item: WidgetItem,
    label: string,
    percent: number,
    format: NumberFormat,
    getCursorOptions: () => UsageCursorOptions | undefined
): string {
    const displayMode = getUsageDisplayMode(item);

    if (isUsageProgressMode(displayMode)) {
        const width = getUsageProgressBarWidth(displayMode);
        const progressBar = makeTimerProgressBar(percent, width, getCursorOptions());
        const progressDisplay = `[${progressBar}] ${formatPercent(percent, format)}`;
        return formatRawOrLabeledValue(item, label, progressDisplay);
    }

    if (isUsageSliderMode(displayMode)) {
        const slider = makeSliderBar(percent, undefined, getCursorOptions());
        const sliderDisplay = displayMode === 'slider' ? `${slider} ${formatPercent(percent, format)}` : slider;
        return formatRawOrLabeledValue(item, label, sliderDisplay);
    }

    return formatRawOrLabeledValue(item, label, formatPercent(percent, format));
}

export function getUsagePercentWidgetDisplayName(kind: UsagePercentWidgetKind): string {
    return USAGE_PERCENT_WIDGET_CONFIG[kind].displayName;
}

export function getUsagePercentWidgetDescription(kind: UsagePercentWidgetKind): string {
    return USAGE_PERCENT_WIDGET_CONFIG[kind].description;
}

export function getUsagePercentWidgetEditorDisplay(kind: UsagePercentWidgetKind, item: WidgetItem): WidgetEditorDisplay {
    return {
        displayText: getUsagePercentWidgetDisplayName(kind),
        modifierText: getUsageDisplayModifierText(item, { showUsageDirection: true })
    };
}

export function handleUsagePercentWidgetEditorAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action === 'toggle-progress') {
        return cycleUsageDisplayMode(item, [], true, true);
    }

    if (action === 'toggle-invert') {
        return toggleUsageInverted(item);
    }

    if (action === 'toggle-cursor') {
        return toggleUsageCursor(item);
    }

    return null;
}

export function renderUsagePercentWidgetValue(
    kind: UsagePercentWidgetKind,
    item: WidgetItem,
    context: RenderContext,
    settings: Settings
): string | null {
    const config = USAGE_PERCENT_WIDGET_CONFIG[kind];
    const inverted = isUsageInverted(item);
    const showCursor = isUsageCursorEnabled(item);
    const format = resolveNumberFormat('percent', item, settings);

    if (context.isPreview) {
        const renderedPercent = inverted ? 100 - config.previewPercent : config.previewPercent;
        return renderUsageDisplay(item, config.label, renderedPercent, format, () => showCursor ? { cursorPercent: 50 } : undefined);
    }

    const data: RenderUsageData = context.usageData ?? {};
    const usagePercent = data[config.usageField];
    if (usagePercent === undefined) {
        if (data.error) {
            return isHidden(item, USAGE_NO_DATA_HIDEABLE_STATE.key)
                ? null
                : getUsageErrorMessage(data.error);
        }
        return null;
    }

    const percent = Math.max(0, Math.min(100, usagePercent));
    const renderedPercent = inverted ? 100 - percent : percent;

    return renderUsageDisplay(item, config.label, renderedPercent, format, () => {
        if (!showCursor) {
            return undefined;
        }

        const window = resolveUsageWindow(kind, data, context);
        return window ? { cursorPercent: window.elapsedPercent } : undefined;
    });
}
