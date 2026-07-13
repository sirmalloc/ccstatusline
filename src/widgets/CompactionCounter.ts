import type {
    CompactionData,
    RenderContext
} from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { ZERO_COMPACTION_STATS } from '../utils/compaction';
import { formatTokens } from '../utils/format-tokens';

import {
    isMetadataFlagEnabled,
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
const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_HIDE_ZERO_ACTION = 'toggle-hide-zero';
const TOGGLE_NERD_FONT_ACTION = 'toggle-nerd-font';
const HIDE_ZERO_METADATA_KEY = 'hideZero';
const NERD_FONT_METADATA_KEY = 'nerdFont';
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
const SAMPLE_STATS: CompactionData = Object.freeze({
    count: 2,
    byTrigger: Object.freeze({ auto: 1, manual: 1, unknown: 0 }),
    tokensReclaimed: 120000
});

function getFormat(item: WidgetItem): CompactionCounterFormat {
    const format = item.metadata?.format;
    return (FORMATS as readonly string[]).includes(format ?? '') ? (format as CompactionCounterFormat) : DEFAULT_FORMAT;
}

function removeNerdFont(item: WidgetItem): WidgetItem {
    const { [NERD_FONT_METADATA_KEY]: removedNerdFont, ...restMetadata } = item.metadata ?? {};
    void removedNerdFont;

    return {
        ...item,
        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
    };
}

function setFormat(item: WidgetItem, format: CompactionCounterFormat): WidgetItem {
    if (format === DEFAULT_FORMAT) {
        const { format: removedFormat, ...restMetadata } = item.metadata ?? {};
        void removedFormat;

        return {
            ...item,
            metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
        };
    }

    const { [NERD_FONT_METADATA_KEY]: removedNerdFont, ...restMetadata } = item.metadata ?? {};
    void removedNerdFont;

    return {
        ...item,
        metadata: {
            ...restMetadata,
            format
        }
    };
}

function isNerdFontEnabled(item: WidgetItem): boolean {
    return item.metadata?.[NERD_FONT_METADATA_KEY] === 'true' && getFormat(item) === DEFAULT_FORMAT;
}

function isHideZeroEnabled(item: WidgetItem): boolean {
    return item.metadata?.[HIDE_ZERO_METADATA_KEY] === 'true';
}

function toggleHideZero(item: WidgetItem): WidgetItem {
    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            [HIDE_ZERO_METADATA_KEY]: (!isHideZeroEnabled(item)).toString()
        }
    };
}

function getMetric(item: WidgetItem): CompactionMetric {
    const metric = item.metadata?.[METRIC_METADATA_KEY];
    return (METRICS as readonly string[]).includes(metric ?? '') ? (metric as CompactionMetric) : DEFAULT_METRIC;
}

function setMetric(item: WidgetItem, metric: CompactionMetric): WidgetItem {
    if (metric === DEFAULT_METRIC) {
        const { [METRIC_METADATA_KEY]: removedMetric, ...restMetadata } = item.metadata ?? {};
        void removedMetric;

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

function formatReclaimedSuffix(tokensReclaimed: number, item: WidgetItem): string {
    if (tokensReclaimed <= 0) {
        return '';
    }
    const symbol = getSlotSymbol(item, RECLAIMED_SLOT);
    return symbol.length > 0 ? ` ${symbol}${formatTokens(tokensReclaimed)}` : ` ${formatTokens(tokensReclaimed)}`;
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

function formatStats(data: CompactionData, item: WidgetItem, icon: string): string {
    let out = formatCount(data.count, getFormat(item), icon);
    if (isMetadataFlagEnabled(item, SHOW_TRIGGERS_METADATA_KEY)) {
        out += formatTriggerSuffix(data.byTrigger);
    }
    if (isMetadataFlagEnabled(item, SHOW_RECLAIMED_METADATA_KEY)) {
        out += formatReclaimedSuffix(data.tokensReclaimed, item);
    }
    return out;
}

function toggleNerdFont(item: WidgetItem): WidgetItem {
    if (getFormat(item) !== DEFAULT_FORMAT) {
        return removeNerdFont(item);
    }

    if (!isNerdFontEnabled(item)) {
        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                [NERD_FONT_METADATA_KEY]: 'true'
            }
        };
    }

    return removeNerdFont(item);
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
            modifiers.push(getFormat(item));
            if (isNerdFontEnabled(item)) {
                modifiers.push('nerd font');
            }
            if (isMetadataFlagEnabled(item, SHOW_TRIGGERS_METADATA_KEY)) {
                modifiers.push('trigger split');
            }
            if (isMetadataFlagEnabled(item, SHOW_RECLAIMED_METADATA_KEY)) {
                modifiers.push('reclaimed');
            }
        }
        if (isHideZeroEnabled(item)) {
            modifiers.push('hide zero');
        }

        return {
            displayText: 'Compaction Counter',
            modifierText: `(${modifiers.join(', ')})`
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_METRIC_ACTION) {
            const currentMetric = getMetric(item);
            const nextMetric = METRICS[(METRICS.indexOf(currentMetric) + 1) % METRICS.length] ?? DEFAULT_METRIC;

            return setMetric(item, nextMetric);
        }

        if (action === CYCLE_FORMAT_ACTION) {
            const currentFormat = getFormat(item);
            const nextFormat = FORMATS[(FORMATS.indexOf(currentFormat) + 1) % FORMATS.length] ?? DEFAULT_FORMAT;

            return setFormat(item, nextFormat);
        }

        if (action === TOGGLE_HIDE_ZERO_ACTION) {
            return toggleHideZero(item);
        }

        if (action === TOGGLE_NERD_FONT_ACTION) {
            return toggleNerdFont(item);
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
        void settings;
        const data = context.isPreview ? SAMPLE_STATS : (context.compactionData ?? ZERO_COMPACTION_STATS);
        const metric = getMetric(item);

        if (metric !== DEFAULT_METRIC) {
            const value = getMetricValue(data, metric);
            if (value === 0 && isHideZeroEnabled(item) && !context.isPreview) {
                return null;
            }
            return metric === 'reclaimed' ? formatTokens(value) : String(value);
        }

        if (data.count === 0 && isHideZeroEnabled(item) && !context.isPreview) {
            return null;
        }

        const icon = isNerdFontEnabled(item) ? COMPACTION_NERD_FONT_ICON : COMPACTION_ICON;
        return formatStats(data, item, icon);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        const keybinds: CustomKeybind[] = [
            { key: 'v', label: '(v)alue', action: CYCLE_METRIC_ACTION }
        ];

        // The format / glyph / trigger toggles only shape the composite 'count'
        // display; a single-metric value just needs the metric and hide-zero.
        if (item !== undefined && getMetric(item) !== DEFAULT_METRIC) {
            keybinds.push({ key: 'h', label: '(h)ide when zero', action: TOGGLE_HIDE_ZERO_ACTION });
            return keybinds;
        }

        keybinds.push({ key: 'f', label: '(f)ormat', action: CYCLE_FORMAT_ACTION });
        if (item === undefined || getFormat(item) === DEFAULT_FORMAT) {
            keybinds.push({ key: 'n', label: '(n)erd font', action: TOGGLE_NERD_FONT_ACTION });
        }
        keybinds.push({ key: 's', label: '(s)plit by trigger', action: TOGGLE_TRIGGERS_ACTION });
        keybinds.push({ key: 't', label: '(t)okens reclaimed', action: TOGGLE_RECLAIMED_ACTION });
        keybinds.push({ key: 'h', label: '(h)ide when zero', action: TOGGLE_HIDE_ZERO_ACTION });
        keybinds.push(getSymbolKeybind());

        return keybinds;
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, [RECLAIMED_SLOT]);
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
