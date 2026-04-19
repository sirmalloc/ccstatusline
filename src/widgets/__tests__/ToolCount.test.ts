import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    ToolActivityEntry,
    ToolCountMetrics
} from '../../types/ToolCountMetrics';
import type { WidgetItem } from '../../types/Widget';
import { ToolCountWidget } from '../ToolCount';

function makeItem(overrides: Partial<WidgetItem> = {}): WidgetItem {
    return { id: 'w1', type: 'tool-count', ...overrides };
}

function makeActivity(entries: Partial<ToolActivityEntry>[]): ToolActivityEntry[] {
    return entries.map((e, i) => ({
        id: e.id ?? `u${i}`,
        tool_name: e.tool_name ?? 'Read',
        category: e.category ?? 'builtin',
        status: e.status ?? 'completed',
        target: e.target,
        startTime: e.startTime ?? new Date(`2026-04-19T10:0${i}:00.000Z`),
        endTime: e.endTime
    }));
}

function makeContext(metrics: Partial<ToolCountMetrics>): RenderContext {
    return {
        toolCountMetrics: {
            totalInvocations: metrics.totalInvocations ?? 0,
            byCategory: metrics.byCategory ?? { builtin: 0, mcp: 0 },
            byTool: metrics.byTool ?? {},
            lastTool: metrics.lastTool ?? null,
            activity: metrics.activity ?? []
        }
    };
}

const settings = {} as Settings;
const widget = new ToolCountWidget();
const activityMode = { mode: 'activity' };

describe('ToolCountWidget — activity mode', () => {
    it('renders running with target plus completed aggregated by frequency', () => {
        const activity = makeActivity([
            { tool_name: 'Edit', status: 'running', target: '/repo/src/auth.ts' },
            { tool_name: 'Read', status: 'completed' },
            { tool_name: 'Read', status: 'completed' },
            { tool_name: 'Read', status: 'completed' },
            { tool_name: 'Bash', status: 'completed' },
            { tool_name: 'Bash', status: 'completed' }
        ]);
        const out = widget.render(
            makeItem({ metadata: activityMode }),
            makeContext({ activity }),
            settings
        );
        expect(out).toBe('Tools: ◐ Edit: auth.ts | ✓ Read ×3 | ✓ Bash ×2');
    });

    it('omits ×N suffix when completed count is 1', () => {
        const activity = makeActivity([
            { tool_name: 'Read', status: 'completed' }
        ]);
        const out = widget.render(
            makeItem({ metadata: activityMode }),
            makeContext({ activity }),
            settings
        );
        expect(out).toBe('Tools: ✓ Read');
    });

    it('omits target for running tools that have none (e.g. Bash)', () => {
        const activity = makeActivity([
            { tool_name: 'Bash', status: 'running' }
        ]);
        const out = widget.render(
            makeItem({ metadata: activityMode }),
            makeContext({ activity }),
            settings
        );
        expect(out).toBe('Tools: ◐ Bash');
    });

    it('filters Agent tool out of activity output', () => {
        const activity = makeActivity([
            { tool_name: 'Agent', status: 'running', target: 'explore' },
            { tool_name: 'Edit', status: 'completed' }
        ]);
        const out = widget.render(
            makeItem({ metadata: activityMode }),
            makeContext({ activity }),
            settings
        );
        expect(out).toBe('Tools: ✓ Edit');
    });

    it('returns Tools: none when no activity and hideWhenEmpty off', () => {
        const out = widget.render(
            makeItem({ metadata: activityMode }),
            makeContext({}),
            settings
        );
        expect(out).toBe('Tools: none');
    });

    it('returns null when no activity and hideWhenEmpty on', () => {
        const out = widget.render(
            makeItem({ metadata: { mode: 'activity', hideWhenEmpty: 'true' } }),
            makeContext({}),
            settings
        );
        expect(out).toBeNull();
    });

    it('preserves icons under rawValue', () => {
        const activity = makeActivity([
            { tool_name: 'Edit', status: 'running', target: '/x/y.ts' },
            { tool_name: 'Read', status: 'completed' },
            { tool_name: 'Read', status: 'completed' }
        ]);
        const out = widget.render(
            makeItem({ metadata: activityMode, rawValue: true }),
            makeContext({ activity }),
            settings
        );
        expect(out).toBe('◐ Edit: y.ts | ✓ Read ×2');
    });

    it('respects listLimit for top-N completed aggregation', () => {
        const activity = makeActivity([
            { tool_name: 'A', status: 'completed' },
            { tool_name: 'A', status: 'completed' },
            { tool_name: 'B', status: 'completed' },
            { tool_name: 'C', status: 'completed' }
        ]);
        const out = widget.render(
            makeItem({ metadata: { mode: 'activity', listLimit: '2' } }),
            makeContext({ activity }),
            settings
        );
        // A has highest count (2), then B/C tied at 1 — second slot goes to most-recent-end.
        expect(out?.startsWith('Tools: ✓ A ×2 | ✓ ')).toBe(true);
        expect(out?.split(' | ')).toHaveLength(2);
    });

    it('filters by scope=mcp', () => {
        const activity = makeActivity([
            { tool_name: 'Edit', category: 'builtin', status: 'completed' },
            { tool_name: 'mcp__foo__bar', category: 'mcp', status: 'completed' }
        ]);
        const out = widget.render(
            makeItem({ metadata: { mode: 'activity', scope: 'mcp' } }),
            makeContext({ activity }),
            settings
        );
        expect(out).toBe('Tools: ✓ mcp__foo__bar');
    });

    it('renders preview in activity mode', () => {
        const out = widget.render(
            makeItem({ metadata: activityMode }),
            { isPreview: true },
            settings
        );
        expect(out).toBe('Tools: ◐ Edit: auth.ts | ✓ Read ×3 | ✓ Bash ×2');
    });
});

describe('ToolCountWidget — keybinds & editor display across modes', () => {
    it('exposes (l)imit on list and activity modes', () => {
        const activity = widget.getCustomKeybinds(makeItem({ metadata: activityMode }));
        expect(activity.find(k => k.action === 'edit-list-limit')).toBeDefined();

        const list = widget.getCustomKeybinds(makeItem({ metadata: { mode: 'list' } }));
        expect(list.find(k => k.action === 'edit-list-limit')).toBeDefined();

        const count = widget.getCustomKeybinds(makeItem({ metadata: { mode: 'count' } }));
        expect(count.find(k => k.action === 'edit-list-limit')).toBeUndefined();
    });

    it('cycles mode current → count → list → activity → current', () => {
        let item = makeItem();
        item = widget.handleEditorAction('cycle-mode', item) ?? item;
        expect(item.metadata?.mode).toBe('count');
        item = widget.handleEditorAction('cycle-mode', item) ?? item;
        expect(item.metadata?.mode).toBe('list');
        item = widget.handleEditorAction('cycle-mode', item) ?? item;
        expect(item.metadata?.mode).toBe('activity');
        item = widget.handleEditorAction('cycle-mode', item) ?? item;
        expect(item.metadata?.mode).toBe('current');
    });

    it('surfaces activity label and limit in editor display', () => {
        const display = widget.getEditorDisplay(makeItem({ metadata: { mode: 'activity', listLimit: '2' } }));
        expect(display.modifierText).toBe('(activity, limit: 2)');
    });
});