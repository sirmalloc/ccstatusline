import type { NumberFormat } from '../types/NumberFormat';
import type {
    CompactionData,
    RenderContext
} from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { ZERO_COMPACTION_STATS } from '../utils/compaction';
import { formatTokens } from '../utils/format-tokens';
import { resolveNumberFormat } from '../utils/number-format';

import {
    getFormat,
    getFormatKeybinds,
    handleFormatAction,
    type FormatOptions
} from './shared/format-options';
import { isHidden } from './shared/hideable';
import {
    isMetadataFlagEnabled,
    isNerdFontEnabled,
    toggleMetadataFlag
} from './shared/metadata';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const COMPACTION_ICON = '↻';
const COMPACTION_NERD_FONT_ICON = '\uF021';
const FORMATS = ['icon-space-number', 'text-and-number', 'number'] as const;
type CompactionCounterFormat = typeof FORMATS[number];

const DEFAULT_FORMAT: CompactionCounterFormat = 'icon-space-number';
const TOGGLE_TRIGGERS_ACTION = 'toggle-triggers';
const SHOW_TRIGGERS_METADATA_KEY = 'showTriggers';
const TOGGLE_RECLAIMED_ACTION = 'toggle-reclaimed';
const SHOW_RECLAIMED_METADATA_KEY = 'showReclaimed';
// Selectable metric. The default 'count' keeps the full composite display
// (icon, count, optional trigger split, optional reclaimed). The other metrics
// render just that one value as a raw number, so several instances can be
// composed with custom separators/symbols into a layout like "2 · 1a 1m · ↓2M".
const METRICS = ['count', 'auto', 'manual', 'unknown', 'reclaimed'] as const;
type CompactionMetric = typeof METRICS[number];
const DEFAULT_METRIC: CompactionMetric = 'count';
const METRIC_METADATA_KEY = 'metric';
const CYCLE_METRIC_ACTION = 'cycle-metric';
const RECLAIMED_SLOT: SymbolSlot = { id: 'symbolReclaimed', label: 'Reclaimed', defaultSymbol: '↓' };
const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when count is zero' };
const SAMPLE_STATS: CompactionData = Object.freeze({
    count: 2,
    byTrigger: Object.freeze({ auto: 1, manual: 1, unknown: 0 }),
    tokensReclaimed: 120000
});

// Only the icon format draws a glyph; the other two are text.
function canUseNerdFont(item: WidgetItem): boolean {
    return getFormat(item, FORMAT_OPTIONS) === DEFAULT_FORMAT;
}

const FORMAT_OPTIONS: FormatOptions<CompactionCounterFormat> = {
    formats: FORMATS,
    defaultFormat: DEFAULT_FORMAT,
    canUseNerdFont
};

function getMetric(item: WidgetItem): CompactionMetric {
    const metric = item.metadata?.[METRIC_METADATA_KEY];
    return (METRICS as readonly string[]).includes(metric ?? '') ? (metric as CompactionMetric) : DEFAULT_METRIC;
}

function setMetric(item: WidgetItem, metric: CompactionMetric): WidgetItem {
    if (metric === DEFAULT_METRIC) {
        const { [METRIC_METADATA_KEY]: removedMetric, ...restMetadata } = item.metadata ?? {};

        return {
            ...item,
            metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
        };
    }

    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            [METRIC_METADATA_KEY]: metric
        }
    };
}

function getMetricValue(data: CompactionData, metric: CompactionMetric): number {
    switch (metric) {
        case 'count': return data.count;
        case 'auto': return data.byTrigger.auto;
        case 'manual': return data.byTrigger.manual;
        case 'unknown': return data.byTrigger.unknown;
        case 'reclaimed': return data.tokensReclaimed;
    }
}

function formatReclaimedSuffix(tokensReclaimed: number, item: WidgetItem, format: NumberFormat): string {
    if (tokensReclaimed <= 0) {
        return '';
    }
    const symbol = getSlotSymbol(item, RECLAIMED_SLOT);
    return symbol.length > 0 ? ` ${symbol}${formatTokens(tokensReclaimed, format)}` : ` ${formatTokens(tokensReclaimed, format)}`;
}

function formatTriggerSuffix(byTrigger: CompactionData['byTrigger']): string {
    const parts: string[] = [];
    if (byTrigger.auto > 0) {
        parts.push(`${byTrigger.auto} auto`);
    }
    if (byTrigger.manual > 0) {
        parts.push(`${byTrigger.manual} manual`);
    }
    if (byTrigger.unknown > 0) {
        parts.push(`${byTrigger.unknown} unknown`);
    }
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function formatStats(data: CompactionData, item: WidgetItem, icon: string, format: NumberFormat): string {
    let out = formatCount(data.count, getFormat(item, FORMAT_OPTIONS), icon);
    if (isMetadataFlagEnabled(item, SHOW_TRIGGERS_METADATA_KEY)) {
        out += formatTriggerSuffix(data.byTrigger);
    }
    if (isMetadataFlagEnabled(item, SHOW_RECLAIMED_METADATA_KEY)) {
        out += formatReclaimedSuffix(data.tokensReclaimed, item, format);
    }
    return out;
}

function formatCount(count: number, format: CompactionCounterFormat, icon: string): string {
    switch (format) {
        case 'icon-space-number': return `${icon} ${count}`;
        case 'text-and-number': return `Compactions: ${count}`;
        case 'number': return String(count);
    }
}

/**
 * Displays a count of context compaction events in the current session.
 *
 * Claude Code periodically compacts (summarizes) conversation context when it
 * approaches the context window limit. This widget tracks how many times
 * compaction has occurred by counting compact_boundary markers in the transcript.
 *
 * Shows ↻ N by default, including ↻ 0 before compaction occurs. Can be
 * configured to hide when count is 0. A `metric` selector switches it to emit a
 * single raw value (count, auto, manual, unknown, or reclaimed) so several
 * instances can be composed into a custom layout.
 */
export class CompactionCounterWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Count of context compaction events in the current session.'; }
    getDisplayName(): string { return 'Compaction Counter'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const metric = getMetric(item);
        const modifiers: string[] = [];

        if (metric !== DEFAULT_METRIC) {
            modifiers.push(`${metric} value`);
        } else {
            modifiers.push(getFormat(item, FORMAT_OPTIONS));
            if (isNerdFontEnabled(item, FORMAT_OPTIONS)) {
                modifiers.push('nerd font');
            }
            if (isMetadataFlagEnabled(item, SHOW_TRIGGERS_METADATA_KEY)) {
                modifiers.push('trigger split');
            }
            if (isMetadataFlagEnabled(item, SHOW_RECLAIMED_METADATA_KEY)) {
                modifiers.push('reclaimed');
            }
        }

        return {
            displayText: 'Compaction Counter',
            modifierText: `(${modifiers.join(', ')})`
        };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_METRIC_ACTION) {
            const currentMetric = getMetric(item);
            const nextMetric = METRICS[(METRICS.indexOf(currentMetric) + 1) % METRICS.length] ?? DEFAULT_METRIC;

            return setMetric(item, nextMetric);
        }

        const formatResult = handleFormatAction(action, item, FORMAT_OPTIONS);
        if (formatResult) {
            return formatResult;
        }

        if (action === TOGGLE_TRIGGERS_ACTION) {
            return toggleMetadataFlag(item, SHOW_TRIGGERS_METADATA_KEY);
        }

        if (action === TOGGLE_RECLAIMED_ACTION) {
            return toggleMetadataFlag(item, SHOW_RECLAIMED_METADATA_KEY);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        const data = context.isPreview ? SAMPLE_STATS : (context.compactionData ?? ZERO_COMPACTION_STATS);
        const metric = getMetric(item);

        if (metric !== DEFAULT_METRIC) {
            const value = getMetricValue(data, metric);
            if (value === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key) && !context.isPreview) {
                return null;
            }
            return metric === 'reclaimed' ? formatTokens(value, format) : String(value);
        }

        if (data.count === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key) && !context.isPreview) {
            return null;
        }

        const icon = isNerdFontEnabled(item, FORMAT_OPTIONS) ? COMPACTION_NERD_FONT_ICON : COMPACTION_ICON;
        return formatStats(data, item, icon, format);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds: CustomKeybind[] = [
            { key: 'v', label: '(v)alue', action: CYCLE_METRIC_ACTION }
        ];

        // The format / glyph / trigger toggles only shape the composite 'count'
        // display; a single-metric value just needs the metric selector, since
        // hide-zero is one of the states in the shared hide checklist.
        if (item !== undefined && getMetric(item) !== DEFAULT_METRIC) {
            return keybinds;
        }

        keybinds.push(
            ...getFormatKeybinds(item, FORMAT_OPTIONS),
            { key: 's', label: '(s)plit by trigger', action: TOGGLE_TRIGGERS_ACTION },
            { key: 't', label: '(t)okens reclaimed', action: TOGGLE_RECLAIMED_ACTION },
            getSymbolKeybind()
        );

        return keybinds;
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [RECLAIMED_SLOT]);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
