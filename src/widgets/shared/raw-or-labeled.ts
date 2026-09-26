import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

// Abbreviated label presets applied when compact labels are enabled. Keys are
// exact default label prefixes as passed to formatRawOrLabeledValue; labels
// without an entry keep their default form. An empty replacement strips the
// label (Cost: $2.46 -> $2.46 — the value's own $ is the glyph). Add entries
// here to cover more widgets — everything routed through the helper picks
// them up automatically.
const COMPACT_LABELS: Record<string, string> = {
    'Model: ': 'M: ',
    'Context: ': 'Ctx: ',
    'Cost: ': ''
};

const COMPACT_LABEL_METADATA_KEY = 'compactLabel';

export const TOGGLE_COMPACT_LABEL_ACTION = 'toggle-compact-label';

// Whether visible text opens with a label that has a compact preset. Used by
// the widget registry probe that decides which widgets see the compact-label
// editor keybind.
export function startsWithCompactLabel(text: string): boolean {
    return Object.keys(COMPACT_LABELS).some(prefix => text.startsWith(prefix));
}

const COMPACT_LABEL_KEYBIND: CustomKeybind = {
    key: 'j',
    label: '(j) compact label',
    action: TOGGLE_COMPACT_LABEL_ACTION
};

export function isCompactLabelEnabled(item: WidgetItem): boolean {
    return item.metadata?.[COMPACT_LABEL_METADATA_KEY] === 'true';
}

export function formatRawOrLabeledValue(item: WidgetItem, labelPrefix: string, value: string): string {
    if (item.rawValue) {
        return value;
    }
    if (isCompactLabelEnabled(item)) {
        const compact = COMPACT_LABELS[labelPrefix];
        if (compact !== undefined) {
            return `${compact}${value}`;
        }
    }
    return `${labelPrefix}${value}`;
}

// Cycle the per-widget compact-label override over the widget's EFFECTIVE
// state, so the toggle stays useful while the global setting is on: compact
// now (saved 'true', or inherited because the global flag is on) -> write an
// explicit 'false'; forced off -> drop the key and inherit the global setting
// again; otherwise -> write 'true'. Dropping the key keeps untouched items'
// metadata minimal.
export function toggleCompactLabel(item: WidgetItem, settings?: Settings): WidgetItem {
    const saved = item.metadata?.[COMPACT_LABEL_METADATA_KEY];
    if (saved === 'true' || (saved === undefined && settings?.compactLabels === true)) {
        return withCompactLabel(item, 'false');
    }
    if (saved === 'false') {
        const { [COMPACT_LABEL_METADATA_KEY]: removed, ...restMetadata } = item.metadata ?? {};
        return {
            ...item,
            metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
        };
    }
    return withCompactLabel(item, 'true');
}

function withCompactLabel(item: WidgetItem, value: string): WidgetItem {
    return {
        ...item,
        metadata: {
            ...item.metadata,
            [COMPACT_LABEL_METADATA_KEY]: value
        }
    };
}

export function getCompactLabelKeybind(): CustomKeybind {
    return COMPACT_LABEL_KEYBIND;
}

// Modifier text reflects the effective state, not just saved metadata, so a
// widget that renders compact via the global setting is still marked.
export function getCompactLabelModifierText(item: WidgetItem, settings?: Settings): string | undefined {
    const saved = item.metadata?.[COMPACT_LABEL_METADATA_KEY];
    if (saved === 'true') {
        return '(compact label)';
    }
    if (saved === 'false') {
        return '(compact label: off)';
    }
    if (saved === undefined && settings?.compactLabels === true) {
        return '(compact label: on)';
    }
    return undefined;
}

// Fold the global Compact Labels setting into the item's metadata right before
// rendering. An explicit per-widget choice wins: 'false' blocks the global
// override, 'true' enables it regardless of the setting. Injecting at render
// time keeps the stored settings untouched and works for every widget routed
// through formatRawOrLabeledValue.
export function withGlobalCompactLabels(widget: WidgetItem, settings: Settings): WidgetItem {
    if (!settings.compactLabels || widget.rawValue) {
        return widget;
    }
    if (widget.metadata?.[COMPACT_LABEL_METADATA_KEY] !== undefined) {
        return widget;
    }
    return {
        ...widget,
        metadata: {
            ...widget.metadata,
            [COMPACT_LABEL_METADATA_KEY]: 'true'
        }
    };
}
