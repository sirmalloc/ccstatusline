import * as fs from 'fs';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';

import { makeModifierText } from './shared/editor-display';
import {
    isMetadataFlagEnabled,
    removeMetadataKeys,
    toggleMetadataFlag
} from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    getSlotSymbol,
    getSymbolKeybind,
    renderSymbolSlotsEditor,
    type SymbolSlot
} from './shared/symbol-override';

const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';
const TOGGLE_HIDE_ACTION = 'toggle-hide';

// Anthropic's ephemeral prompt cache defaults to a 5-minute TTL, but Claude Code
// also writes 1-hour breakpoints (cache_control ttl: "1h") for the stable prefix.
// The expiry itself is never exposed (the transcript only records token counts),
// so this is a best-effort countdown from the last turn; the TTL is configurable
// to match whichever tier the user cares about.
const TTL_METADATA_KEY = 'ttlSeconds';
const DEFAULT_TTL_SECONDS = 300;
const TTL_OPTIONS = [300, 3600] as const; // 5 minutes, 1 hour
const TOGGLE_TTL_ACTION = 'toggle-ttl';

const SAFETY_MARGIN = 5; // display as COLD 5s before actual expiry

// One editable glyph per display state, so nerd-font / ASCII users can replace
// the emoji (which ignore the widget's color) with symbols that respect it.
const HOT_SLOT: SymbolSlot = { id: 'symbolHot', label: 'Working', defaultSymbol: '🔥' };
const FRESH_SLOT: SymbolSlot = { id: 'symbolFresh', label: 'Fresh', defaultSymbol: '🟢' };
const DRAINING_SLOT: SymbolSlot = { id: 'symbolDraining', label: 'Draining', defaultSymbol: '🟡' };
const URGENT_SLOT: SymbolSlot = { id: 'symbolUrgent', label: 'Urgent', defaultSymbol: '🔴' };
const COLD_SLOT: SymbolSlot = { id: 'symbolCold', label: 'Cold', defaultSymbol: '❄️' };
const SYMBOL_SLOTS: SymbolSlot[] = [HOT_SLOT, FRESH_SLOT, DRAINING_SLOT, URGENT_SLOT, COLD_SLOT];

interface TranscriptEntry {
    type?: string;
    timestamp?: string;
    isSidechain?: boolean;
    isApiErrorMessage?: boolean;
}

/**
 * Read the last N bytes of a file and return as string.
 * Avoids loading large transcript files entirely.
 */
function readFileTail(filePath: string, bytes = 32768): string {
    try {
        const fd = fs.openSync(filePath, 'r');
        const stat = fs.fstatSync(fd);
        const size = stat.size;
        const readSize = Math.min(bytes, size);
        const offset = size - readSize;
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, offset);
        fs.closeSync(fd);
        return buf.toString('utf-8');
    } catch {
        return '';
    }
}

/**
 * Find the most recent user/assistant entry in the transcript tail.
 * A trailing user-role entry (a prompt or a tool result, both recorded as
 * role 'user' by Claude Code) means a turn is in flight and the cache is being
 * refreshed, so report { isWorking: true }. A trailing assistant entry means
 * the turn finished, so return its timestamp to drive the countdown.
 */
function getTranscriptState(transcriptPath: string): { isWorking: true } | { isWorking: false; lastAssistant: Date | null } {
    const tail = readFileTail(transcriptPath);
    if (!tail) {
        return { isWorking: false, lastAssistant: null };
    }

    const lines = tail.split('\n').reverse();
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        try {
            const entry = JSON.parse(trimmed) as TranscriptEntry;
            // Sidechain (subagent) traffic and synthetic API-error rows never
            // touch the main conversation's cache, so they must not flip the
            // state to HOT or restart the countdown; keep scanning for the
            // newest main-chain row instead.
            if (entry.isSidechain === true || entry.isApiErrorMessage === true) {
                continue;
            }
            if (entry.type === 'user') {
                return { isWorking: true };
            }
            if (entry.type === 'assistant' && entry.timestamp) {
                const parsed = new Date(entry.timestamp);
                // A malformed timestamp must not flow through to a NaN countdown;
                // treat it as no data so the empty-state path renders instead.
                return {
                    isWorking: false,
                    lastAssistant: Number.isNaN(parsed.getTime()) ? null : parsed
                };
            }
        } catch {
            continue;
        }
    }
    return { isWorking: false, lastAssistant: null };
}

// The configured TTL in seconds. Defaults to 5 minutes; the (t)tl keybind cycles
// 5m/1h, and any other positive value can be set directly in settings.json.
function getTtlSeconds(item: WidgetItem): number {
    const raw = item.metadata?.[TTL_METADATA_KEY];
    if (raw === undefined) {
        return DEFAULT_TTL_SECONDS;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > SAFETY_MARGIN ? parsed : DEFAULT_TTL_SECONDS;
}

function cycleTtl(item: WidgetItem): WidgetItem {
    const current = getTtlSeconds(item);
    const index = (TTL_OPTIONS as readonly number[]).indexOf(current);
    const next = TTL_OPTIONS[(index + 1) % TTL_OPTIONS.length] ?? DEFAULT_TTL_SECONDS;
    if (next === DEFAULT_TTL_SECONDS) {
        return removeMetadataKeys(item, [TTL_METADATA_KEY]);
    }
    return {
        ...item,
        metadata: {
            ...item.metadata,
            [TTL_METADATA_KEY]: String(next)
        }
    };
}

function formatTtlLabel(ttlSeconds: number): string {
    return ttlSeconds % 3600 === 0 ? `${ttlSeconds / 3600}h` : `${Math.round(ttlSeconds / 60)}m`;
}

function getRemainingSeconds(lastAssistant: Date, ttlSeconds: number): number {
    const elapsedSeconds = (Date.now() - lastAssistant.getTime()) / 1000;
    return ttlSeconds - SAFETY_MARGIN - elapsedSeconds;
}

function formatCountdown(remaining: number): string {
    if (remaining <= 0) {
        return 'COLD';
    }
    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// The glyph for the current drain state (excluding HOT, handled in render).
function getStateSymbol(item: WidgetItem, remaining: number, ttlSeconds: number): string {
    if (remaining <= 0) {
        return getSlotSymbol(item, COLD_SLOT);
    }
    const pct = remaining / (ttlSeconds - SAFETY_MARGIN);
    if (pct > 0.5) {
        return getSlotSymbol(item, FRESH_SLOT);
    }
    if (pct > 0.2) {
        return getSlotSymbol(item, DRAINING_SLOT);
    }
    return getSlotSymbol(item, URGENT_SLOT);
}

// Joins a glyph to its countdown; a blanked glyph collapses the leading space.
function withGlyph(symbol: string, text: string): string {
    return symbol.length > 0 ? `${symbol} ${text}` : text;
}

export class CacheTimerWidget implements Widget {
    getDefaultColor(): string { return 'brightCyan'; }
    getDescription(): string { return 'Shows time remaining on the prompt cache TTL (5m by default, 1h configurable)'; }
    getDisplayName(): string { return 'Cache Timer'; }
    getCategory(): string { return 'Session'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [];

        const ttlSeconds = getTtlSeconds(item);
        if (ttlSeconds !== DEFAULT_TTL_SECONDS) {
            modifiers.push(`ttl ${formatTtlLabel(ttlSeconds)}`);
        }
        if (isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY)) {
            modifiers.push('hide when empty');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_HIDE_ACTION) {
            return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
        }

        if (action === TOGGLE_TTL_ACTION) {
            return cycleTtl(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideWhenEmpty = isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY);

        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cache: ', withGlyph(getSlotSymbol(item, FRESH_SLOT), '4:52'));
        }

        const transcriptPath = context.data?.transcript_path;
        if (!transcriptPath) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, 'Cache: ', 'n/a');
        }

        const state = getTranscriptState(transcriptPath);

        if (state.isWorking) {
            return formatRawOrLabeledValue(item, 'Cache: ', withGlyph(getSlotSymbol(item, HOT_SLOT), 'HOT'));
        }

        const { lastAssistant } = state;
        if (!lastAssistant) {
            return hideWhenEmpty ? null : formatRawOrLabeledValue(item, 'Cache: ', 'n/a');
        }

        const ttlSeconds = getTtlSeconds(item);
        const remaining = getRemainingSeconds(lastAssistant, ttlSeconds);
        const glyph = getStateSymbol(item, remaining, ttlSeconds);

        return formatRawOrLabeledValue(item, 'Cache: ', withGlyph(glyph, formatCountdown(remaining)));
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 't', label: '(t)tl', action: TOGGLE_TTL_ACTION },
            { key: 'h', label: '(h)ide when empty', action: TOGGLE_HIDE_ACTION },
            getSymbolKeybind()
        ];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolSlotsEditor(props, SYMBOL_SLOTS);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
