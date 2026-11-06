import type { NumberFormat } from '../../types/NumberFormat';
import type {
    RenderContext,
    RenderUsageData
} from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
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
import { formatRawOrLabeledValue } from './raw-or-labeled';
import {
    USAGE_NO_DATA_HIDEABLE_STATE,
    cycleUsageDisplayMode,
    formatUsageBar,
    getUsageDisplayModifierText,
    getUsagePercentCustomKeybinds,
    isUsageCursorEnabled,
    isUsageInverted,
    toggleUsageCursor,
    toggleUsageInverted
} from './usage-display';

export type UsagePercentWidgetKind = 'session' | 'weekly' | 'weekly-sonnet' | 'weekly-opus' | 'fable-weekly' | 'spend-limit';

type UsagePercentField = 'sessionUsage' | 'weeklyUsage' | 'weeklySonnetUsage' | 'weeklyOpusUsage' | 'fableUsage' | 'spendLimitUsage';

interface UsageCursorOptions { cursorPercent: number }

interface UsagePercentWidgetKindConfig {
    label: string;
    displayName: string;
    description: string;
    previewPercent: number;
    usageField: UsagePercentField;
    // The value comes from the statusline payload, so usage API errors say nothing about it.
    ignoreApiError?: boolean;
}

const USAGE_PERCENT_WIDGET_CONFIG: Record<UsagePercentWidgetKind, UsagePercentWidgetKindConfig> = {
    'session': {
        label: '5h: ',
        displayName: 'Block Usage',
        description: 'Shows the current 5-hour block\'s usage percentage',
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
    },
    'spend-limit': {
        label: 'Spend Limit: ',
        displayName: 'Spend Limit Usage',
        description: 'Shows the percentage of your Claude apps gateway spend limit used',
        previewPercent: 40,
        usageField: 'spendLimitUsage',
        ignoreApiError: true
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
    if (!hasUsageWindow(kind)) {
        return null;
    }
    return resolveFableUsageWindow(data);
}

// The spend limit payload does not say how long the limit's period is, so there
// is no window to place a time cursor in.
function hasUsageWindow(kind: UsagePercentWidgetKind): boolean {
    return kind !== 'spend-limit';
}

function renderUsageDisplay(
    item: WidgetItem,
    label: string,
    percent: number,
    format: NumberFormat,
    getCursorOptions: () => UsageCursorOptions | undefined
): string {
    const bar = formatUsageBar(item, percent, format, getCursorOptions);
    return formatRawOrLabeledValue(item, label, bar ?? formatPercent(percent, format));
}

export function getUsagePercentWidgetDisplayName(kind: UsagePercentWidgetKind): string {
    return USAGE_PERCENT_WIDGET_CONFIG[kind].displayName;
}

export function getUsagePercentWidgetLabel(kind: UsagePercentWidgetKind): string {
    return USAGE_PERCENT_WIDGET_CONFIG[kind].label;
}

export function getUsagePercentWidgetDescription(kind: UsagePercentWidgetKind): string {
    return USAGE_PERCENT_WIDGET_CONFIG[kind].description;
}

export function getUsagePercentWidgetEditorDisplay(kind: UsagePercentWidgetKind, item: WidgetItem): WidgetEditorDisplay {
    return {
        displayText: getUsagePercentWidgetDisplayName(kind),
        modifierText: getUsageDisplayModifierText(item, { showUsageDirection: true, includeCursor: true })
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
        if (data.error && !config.ignoreApiError) {
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

        // A remaining-percent bar shrinks as the window runs out, so its cursor
        // marks the time left, keeping the cursor and the fill on one scale.
        const window = resolveUsageWindow(kind, data, context);
        if (!window) {
            return undefined;
        }
        return { cursorPercent: inverted ? window.remainingPercent : window.elapsedPercent };
    });
}

// Session, Weekly, Weekly Sonnet, Weekly Opus and Fable Weekly Usage differ only
// in their kind
export class UsagePercentWidget implements Widget {
    private readonly kind: UsagePercentWidgetKind;

    constructor(kind: UsagePercentWidgetKind) {
        this.kind = kind;
    }

    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return getUsagePercentWidgetDescription(this.kind); }
    getDisplayName(): string { return getUsagePercentWidgetDisplayName(this.kind); }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return getUsagePercentWidgetLabel(this.kind); }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getUsagePercentWidgetEditorDisplay(this.kind, item);
    }

    // The state hides the usage API's error, which a widget that ignores API errors never shows
    getHideableStates(): HideableState[] {
        return USAGE_PERCENT_WIDGET_CONFIG[this.kind].ignoreApiError ? [] : [USAGE_NO_DATA_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleUsagePercentWidgetEditorAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderUsagePercentWidgetValue(this.kind, item, context, settings);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item, hasUsageWindow(this.kind));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
