import type {
    RenderContext,
    RenderWakatimeData
} from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { renderOsc8Link } from '../utils/hyperlink';

import { makeModifierText } from './shared/editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';

const FORMAT_KEY = 'format';
const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';
const PREFIX_KEY = 'prefix';
const LINK_KEY = 'link';

const CYCLE_FORMAT_ACTION = 'cycle-format';
const TOGGLE_HIDE_EMPTY_ACTION = 'toggle-hide-empty';
const CYCLE_PREFIX_ACTION = 'cycle-prefix';
const TOGGLE_LINK_ACTION = 'toggle-link';

const DASHBOARD_URL = 'https://wakatime.com/dashboard';
const DEFAULT_PREFIX = 'WK ';
const PREFIX_OPTIONS = ['WK ', '⏱ ', 'Wakatime: ', ''] as const;
const FORMAT_OPTIONS = ['human', 'digital', 'text', 'decimal'] as const;
const FALLBACK_VALUE = '-';

type WakatimeFormat = (typeof FORMAT_OPTIONS)[number];

function getFormat(item: WidgetItem): WakatimeFormat {
    const raw = item.metadata?.[FORMAT_KEY];
    return (FORMAT_OPTIONS as readonly string[]).includes(raw ?? '') ? raw as WakatimeFormat : 'human';
}

function getPrefix(item: WidgetItem): string {
    const raw = item.metadata?.[PREFIX_KEY];
    return raw ?? DEFAULT_PREFIX;
}

function isLinkEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, LINK_KEY);
}

function cycleFormat(item: WidgetItem): WidgetItem {
    const current = getFormat(item);
    const idx = FORMAT_OPTIONS.indexOf(current);
    const next = FORMAT_OPTIONS[(idx + 1) % FORMAT_OPTIONS.length] ?? 'human';
    return {
        ...item,
        metadata: { ...item.metadata, [FORMAT_KEY]: next }
    };
}

function cyclePrefix(item: WidgetItem): WidgetItem {
    const current = getPrefix(item);
    const idx = PREFIX_OPTIONS.indexOf(current as (typeof PREFIX_OPTIONS)[number]);
    const next = PREFIX_OPTIONS[(idx + 1) % PREFIX_OPTIONS.length] ?? DEFAULT_PREFIX;
    return {
        ...item,
        metadata: { ...item.metadata, [PREFIX_KEY]: next }
    };
}

/**
 * Convert a Wakatime "digital" string (e.g. "6:25" or "1:06:25") into a
 * human-friendly form (e.g. "6h25m" or "1h06m"). Falls back to the raw
 * input when the string does not look like a digital duration.
 */
export function formatDigitalAsHuman(digital: string | undefined): string | null {
    if (!digital) {
        return null;
    }
    const parts = digital.split(':');
    if (parts.length === 2) {
        const [hours, minutes] = parts;
        if (hours === undefined || minutes === undefined) {
            return digital;
        }
        const h = Number.parseInt(hours, 10);
        const m = Number.parseInt(minutes, 10);
        if (Number.isNaN(h) || Number.isNaN(m)) {
            return digital;
        }
        if (h === 0) {
            return `${m}m`;
        }
        return `${h}h${m.toString().padStart(2, '0')}m`;
    }
    if (parts.length === 3) {
        const [hours, minutes] = parts;
        if (hours === undefined || minutes === undefined) {
            return digital;
        }
        const h = Number.parseInt(hours, 10);
        const m = Number.parseInt(minutes, 10);
        if (Number.isNaN(h) || Number.isNaN(m)) {
            return digital;
        }
        if (h === 0) {
            return `${m}m`;
        }
        return `${h}h${m.toString().padStart(2, '0')}m`;
    }
    return digital;
}

export function formatWakatimeValue(data: RenderWakatimeData, format: WakatimeFormat): string | null {
    switch (format) {
        case 'digital':
            return data.digital ?? null;
        case 'text':
            return data.text ?? null;
        case 'decimal': {
            const decimal = data.decimal;
            if (typeof decimal === 'string' && decimal.length > 0) {
                return `${decimal}h`;
            }
            return null;
        }
        case 'human':
        default:
            return formatDigitalAsHuman(data.digital);
    }
}

function applyOptionalLink(text: string, item: WidgetItem): string {
    if (!isLinkEnabled(item)) {
        return text;
    }
    return renderOsc8Link(DASHBOARD_URL, text);
}

export class WakatimeTodayWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows today\'s coding time from Wakatime (reads ~/.wakatime.cfg)'; }
    getDisplayName(): string { return 'Wakatime Today'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [`format:${getFormat(item)}`];
        const prefix = getPrefix(item);
        if (prefix !== DEFAULT_PREFIX) {
            modifiers.push(`prefix:${prefix.length === 0 ? '∅' : prefix.trim() || prefix}`);
        }
        if (isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY)) {
            modifiers.push('hide when empty');
        }
        if (isLinkEnabled(item)) {
            modifiers.push('link');
        }
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_FORMAT_ACTION) {
            return cycleFormat(item);
        }
        if (action === TOGGLE_HIDE_EMPTY_ACTION) {
            return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
        }
        if (action === CYCLE_PREFIX_ACTION) {
            return cyclePrefix(item);
        }
        if (action === TOGGLE_LINK_ACTION) {
            return toggleMetadataFlag(item, LINK_KEY);
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        void settings;
        const prefix = getPrefix(item);
        const format = getFormat(item);
        const hideWhenEmpty = isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY);

        if (context.isPreview) {
            const previewData: RenderWakatimeData = {
                digital: '6:25',
                text: '6 hrs 25 mins',
                decimal: '6.42',
                totalSeconds: 6 * 3600 + 25 * 60
            };
            const value = formatWakatimeValue(previewData, format) ?? FALLBACK_VALUE;
            const display = item.rawValue ? value : `${prefix}${value}`;
            return applyOptionalLink(display, item);
        }

        const data = context.wakatimeData ?? null;
        const renderFallback = (): string | null => {
            if (hideWhenEmpty) {
                return null;
            }
            const fallback = item.rawValue ? FALLBACK_VALUE : `${prefix}${FALLBACK_VALUE}`;
            return applyOptionalLink(fallback, item);
        };

        if (!data || data.error) {
            return renderFallback();
        }

        const value = formatWakatimeValue(data, format);
        if (!value) {
            return renderFallback();
        }

        const display = item.rawValue ? value : `${prefix}${value}`;
        return applyOptionalLink(display, item);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'f', label: '(f)ormat', action: CYCLE_FORMAT_ACTION },
            { key: 'p', label: '(p)refix', action: CYCLE_PREFIX_ACTION },
            { key: 'h', label: '(h)ide when empty', action: TOGGLE_HIDE_EMPTY_ACTION },
            { key: 'l', label: '(l)ink', action: TOGGLE_LINK_ACTION }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean {
        void item;
        return true;
    }
}
