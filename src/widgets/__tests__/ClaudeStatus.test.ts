import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { ClaudeStatusWidget } from '../ClaudeStatus';

const HOUR_MS = 60 * 60 * 1000;
const NOW = Date.parse('2026-08-15T12:00:00Z');

// DEFAULT_SETTINGS.colorLevel is 2 (ansi256); the history strip resolves its
// bucket colors to explicit ansi256 escapes, independent of chalk's level.
const GREEN = '\x1b[38;5;70m';
const YELLOW = '\x1b[38;5;178m';
const ORANGE = '\x1b[38;5;208m';
const RESET_FG = '\x1b[39m';

const baseItem: WidgetItem = { id: 'claude-status', type: 'claude-status' };
const historyItem: WidgetItem = { ...baseItem, metadata: { history: 'true' } };

function render(
    widget: ClaudeStatusWidget,
    item: WidgetItem,
    context: RenderContext = {},
    settings: Settings = DEFAULT_SETTINGS
): string | null {
    return widget.render(item, context, settings);
}

describe('ClaudeStatusWidget', () => {
    beforeEach(() => {
        vi.spyOn(Date, 'now').mockReturnValue(NOW);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders "ok" for the none indicator and the indicator word otherwise', () => {
        const widget = new ClaudeStatusWidget();
        expect(render(widget, baseItem, { claudeStatusData: { indicator: 'none' } })).toBe('Claude: ok');
        expect(render(widget, baseItem, { claudeStatusData: { indicator: 'minor' } })).toBe('Claude: minor');
        expect(render(widget, baseItem, { claudeStatusData: { indicator: 'maintenance' } })).toBe('Claude: maintenance');
    });

    it('passes an unrecognized indicator through unchanged', () => {
        const widget = new ClaudeStatusWidget();
        expect(render(widget, baseItem, { claudeStatusData: { indicator: 'degraded_performance' } })).toBe('Claude: degraded_performance');
    });

    it('drops the label in raw value mode', () => {
        const widget = new ClaudeStatusWidget();
        expect(render(widget, { ...baseItem, rawValue: true }, { claudeStatusData: { indicator: 'none' } })).toBe('ok');
    });

    it('degrades to "?" when status data is missing or errored', () => {
        const widget = new ClaudeStatusWidget();
        expect(render(widget, baseItem, {})).toBe('Claude: ?');
        expect(render(widget, baseItem, { claudeStatusData: null })).toBe('Claude: ?');
        expect(render(widget, baseItem, { claudeStatusData: { error: true } })).toBe('Claude: ?');
    });

    it('renders a colored 8-bucket history strip from incident windows', () => {
        const widget = new ClaudeStatusWidget();
        const context: RenderContext = {
            claudeStatusData: {
                indicator: 'none',
                incidents: [
                    // 13h-8h ago: overlaps the 18-12h and 12-6h buckets
                    { impact: 'minor', startMs: NOW - 13 * HOUR_MS, endMs: NOW - 8 * HOUR_MS },
                    // unresolved since 4h ago: newest bucket only
                    { impact: 'major', startMs: NOW - 4 * HOUR_MS, endMs: null }
                ]
            }
        };

        const greenBar = `${GREEN}▮${RESET_FG}`;
        expect(render(widget, historyItem, context)).toBe(
            `Claude: ${GREEN}ok${RESET_FG} `
            + greenBar.repeat(5)
            + `${YELLOW}▮${RESET_FG}`.repeat(2)
            + `${ORANGE}▮${RESET_FG}`
        );
    });

    it('renders the history strip without escapes when colors are disabled', () => {
        const widget = new ClaudeStatusWidget();
        const context: RenderContext = { claudeStatusData: { indicator: 'none', incidents: [] } };
        expect(render(widget, historyItem, context, { ...DEFAULT_SETTINGS, colorLevel: 0 })).toBe('Claude: ok ▮▮▮▮▮▮▮▮');
    });

    it('renders an all-green strip when the incident list is absent', () => {
        const widget = new ClaudeStatusWidget();
        const context: RenderContext = { claudeStatusData: { indicator: 'none' } };
        expect(render(widget, historyItem, context)).toBe(
            `Claude: ${GREEN}ok${RESET_FG} ${`${GREEN}▮${RESET_FG}`.repeat(8)}`
        );
    });

    it('renders preview content without live data', () => {
        const widget = new ClaudeStatusWidget();
        expect(render(widget, baseItem, { isPreview: true })).toBe('Claude: ok');
        const historyPreview = render(widget, historyItem, { isPreview: true });
        expect(historyPreview).toContain('Claude: ');
        expect(historyPreview).toContain('▮');
    });

    it('toggles history mode through the editor action and reports it in the editor display', () => {
        const widget = new ClaudeStatusWidget();

        expect(widget.getEditorDisplay(baseItem)).toEqual({ displayText: 'Claude Status', modifierText: undefined });
        expect(widget.getEditorDisplay(historyItem)).toEqual({ displayText: 'Claude Status', modifierText: '(history)' });
        expect(widget.getCustomKeybinds()).toEqual([
            { key: 'h', label: '(h)istory toggle', action: 'toggle-history' }
        ]);

        const enabled = widget.handleEditorAction('toggle-history', baseItem);
        expect(enabled?.metadata?.history).toBe('true');
        const disabled = widget.handleEditorAction('toggle-history', historyItem);
        expect(disabled?.metadata?.history).toBe('false');
        expect(widget.handleEditorAction('unknown-action', baseItem)).toBeNull();
    });

    it('preserves its own colors only in history mode', () => {
        const widget = new ClaudeStatusWidget();
        expect(widget.preservesRenderedColors(baseItem)).toBe(false);
        expect(widget.preservesRenderedColors(historyItem)).toBe(true);
        expect(widget.supportsColors(baseItem)).toBe(true);
        expect(widget.supportsColors(historyItem)).toBe(false);
        expect(widget.supportsRawValue()).toBe(true);
    });
});
