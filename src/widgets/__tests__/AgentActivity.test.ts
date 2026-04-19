import {
    describe,
    expect,
    it
} from 'vitest';

import type { AgentEntry } from '../../types/AgentActivityMetrics';
import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    AgentActivityWidget,
    applyLimit,
    filterByMode,
    formatAgent,
    formatElapsed,
    type AgentDisplayFlags
} from '../AgentActivity';

describe('AgentActivityWidget — identity', () => {
    const widget = new AgentActivityWidget();

    it('has stable widget metadata', () => {
        expect(widget.getDefaultColor()).toBe('magenta');
        expect(widget.getDisplayName()).toBe('Agent Activity');
        expect(widget.getCategory()).toBe('Session');
        expect(widget.supportsRawValue()).toBe(true);
        expect(widget.supportsColors(
            { id: 'agent-activity', type: 'agent-activity' }
        )).toBe(true);
    });

    it('registers PreToolUse and PostToolUse hooks for Agent', () => {
        expect(widget.getHooks()).toEqual([
            { event: 'PreToolUse', matcher: 'Agent' },
            { event: 'PostToolUse', matcher: 'Agent' }
        ]);
    });
});

describe('formatElapsed', () => {
    function elapsed(startMs: number, endMs: number | undefined): string {
        return formatElapsed(new Date(startMs), endMs === undefined ? undefined : new Date(endMs), new Date(endMs ?? startMs + 500));
    }

    it('returns <1s for sub-second durations', () => {
        expect(elapsed(1000, 1500)).toBe('<1s');
    });

    it('returns seconds for <60s', () => {
        expect(elapsed(1000, 1000 + 12_000)).toBe('12s');
    });

    it('returns minutes and seconds for 1-60min', () => {
        expect(elapsed(1000, 1000 + (2 * 60 + 34) * 1000)).toBe('2m 34s');
    });

    it('returns hours and minutes for >=1h', () => {
        expect(elapsed(1000, 1000 + (3 * 3600 + 45 * 60) * 1000)).toBe('3h 45m');
    });

    it('computes running elapsed using "now" when endTime undefined', () => {
        const start = new Date(0);
        expect(formatElapsed(start, undefined, new Date(42_000))).toBe('42s');
    });
});

describe('formatAgent', () => {
    function makeAgent(overrides: Partial<AgentEntry> = {}): AgentEntry {
        return {
            id: 'a',
            type: 'explore',
            model: 'haiku',
            description: 'Finding auth code',
            status: 'running',
            startTime: new Date(0),
            ...overrides
        };
    }

    const defaultFlags: AgentDisplayFlags = { hideModel: false, hideDescription: false, hideElapsed: false };
    const now = new Date(12_000);

    it('renders full running agent with all fields', () => {
        expect(formatAgent(makeAgent(), defaultFlags, false, now))
            .toBe('◐ explore [haiku]: Finding auth code (12s)');
    });

    it('renders completed agent with ✓ icon', () => {
        const agent = makeAgent({
            status: 'completed',
            endTime: new Date(12_000)
        });
        expect(formatAgent(agent, defaultFlags, false, now))
            .toBe('✓ explore [haiku]: Finding auth code (12s)');
    });

    it('omits icon and label when rawValue=true', () => {
        expect(formatAgent(makeAgent(), defaultFlags, true, now))
            .toBe('explore [haiku]: Finding auth code (12s)');
    });

    it('hides model when hideModel flag set', () => {
        const flags: AgentDisplayFlags = { ...defaultFlags, hideModel: true };
        expect(formatAgent(makeAgent(), flags, false, now))
            .toBe('◐ explore: Finding auth code (12s)');
    });

    it('hides description when hideDescription flag set', () => {
        const flags: AgentDisplayFlags = { ...defaultFlags, hideDescription: true };
        expect(formatAgent(makeAgent(), flags, false, now))
            .toBe('◐ explore [haiku] (12s)');
    });

    it('hides elapsed when hideElapsed flag set', () => {
        const flags: AgentDisplayFlags = { ...defaultFlags, hideElapsed: true };
        expect(formatAgent(makeAgent(), flags, false, now))
            .toBe('◐ explore [haiku]: Finding auth code');
    });

    it('truncates description to 40 chars with ellipsis', () => {
        const longDesc = 'x'.repeat(50);
        const agent = makeAgent({ description: longDesc });
        const output = formatAgent(agent, defaultFlags, false, now);
        expect(output).toContain(`: ${'x'.repeat(37)}...`);
    });

    it('omits model bracket when agent.model undefined', () => {
        const agent = makeAgent({ model: undefined });
        expect(formatAgent(agent, defaultFlags, false, now))
            .toBe('◐ explore: Finding auth code (12s)');
    });

    it('omits description when agent.description undefined', () => {
        const agent = makeAgent({ description: undefined });
        expect(formatAgent(agent, defaultFlags, false, now))
            .toBe('◐ explore [haiku] (12s)');
    });
});

describe('filterByMode', () => {
    function agents(statuses: ('running' | 'completed')[]): AgentEntry[] {
        return statuses.map((status, i) => ({
            id: `a${i}`,
            type: `t${i}`,
            status,
            startTime: new Date(i * 1000)
        }));
    }

    it('current returns a single-element array with the latest agent', () => {
        const input = agents(['running', 'completed', 'running']);
        expect(filterByMode(input, 'current').map(a => a.id)).toEqual(['a2']);
    });

    it('current returns empty array when no agents', () => {
        expect(filterByMode([], 'current')).toEqual([]);
    });

    it('activity returns the input unchanged when hideCompleted=false', () => {
        const input = agents(['running', 'completed', 'running']);
        expect(filterByMode(input, 'activity')).toEqual(input);
    });

    it('activity with hideCompleted=true returns only running agents', () => {
        const input = agents(['running', 'completed', 'running']);
        expect(filterByMode(input, 'activity', true).map(a => a.id)).toEqual(['a0', 'a2']);
    });

    it('count/list return all agents (aggregation handled in render)', () => {
        const input = agents(['running', 'completed']);
        expect(filterByMode(input, 'count')).toEqual(input);
        expect(filterByMode(input, 'list')).toEqual(input);
    });
});

describe('applyLimit', () => {
    function agents(count: number): AgentEntry[] {
        return Array.from({ length: count }, (_, i) => ({
            id: `a${i}`,
            type: `t${i}`,
            status: 'running' as const,
            startTime: new Date(i * 1000)
        }));
    }

    it('returns array unchanged when limit=0', () => {
        const input = agents(5);
        expect(applyLimit(input, 0)).toEqual(input);
    });

    it('returns last N entries when agents.length > limit', () => {
        expect(applyLimit(agents(5), 3).map(a => a.id)).toEqual(['a2', 'a3', 'a4']);
    });

    it('returns all entries when agents.length <= limit', () => {
        expect(applyLimit(agents(2), 5).map(a => a.id)).toEqual(['a0', 'a1']);
    });
});

function makeContext(agents: AgentEntry[], isPreview = false): RenderContext {
    return {
        agentActivityMetrics: { agents },
        isPreview
    };
}

describe('AgentActivityWidget.render — core modes', () => {
    const widget = new AgentActivityWidget();
    const item: WidgetItem = { id: 'a', type: 'agent-activity' };

    const runningAgent: AgentEntry = {
        id: 'r1',
        type: 'explore',
        model: 'haiku',
        description: 'Finding auth',
        status: 'running',
        startTime: new Date(Date.now() - 12_000)
    };
    const completedAgent: AgentEntry = {
        id: 'c1',
        type: 'code-reviewer',
        model: 'opus',
        description: 'Review complete',
        status: 'completed',
        startTime: new Date(Date.now() - 200_000),
        endTime: new Date(Date.now() - 40_000)
    };

    it('activity mode (default) joins with " | " and mixes running + completed', () => {
        const ctx = makeContext([runningAgent, completedAgent]);
        const output = widget.render(item, ctx, DEFAULT_SETTINGS);
        expect(output).toMatch(/^Agents: /);
        expect(output).toContain(' | ');
        expect(output).toContain('◐ explore');
        expect(output).toContain('✓ code-reviewer');
    });

    it('activity mode with hideCompleted joins with ", " and only shows running', () => {
        const ctx = makeContext([runningAgent, completedAgent]);
        const runningOnly: WidgetItem = { ...item, metadata: { mode: 'activity', hideCompleted: 'true' } };
        const output = widget.render(runningOnly, ctx, DEFAULT_SETTINGS);
        expect(output).toMatch(/^Agents: /);
        expect(output).not.toContain(' | ');
        expect(output).not.toContain('✓');
        expect(output).toContain('◐ explore');
    });

    it('current mode shows one agent (latest)', () => {
        const ctx = makeContext([runningAgent, completedAgent]);
        const currentItem: WidgetItem = { ...item, metadata: { mode: 'current' } };
        const output = widget.render(currentItem, ctx, DEFAULT_SETTINGS);
        expect(output).toMatch(/^Agents: /);
        expect(output).toContain('code-reviewer');
        expect(output).not.toContain('explore');
    });

    it('count mode shows total agent count', () => {
        const ctx = makeContext([runningAgent, completedAgent]);
        const countItem: WidgetItem = { ...item, metadata: { mode: 'count' } };
        expect(widget.render(countItem, ctx, DEFAULT_SETTINGS)).toBe('Agents: 2');
    });

    it('list mode aggregates by type and sorts by count desc', () => {
        const extra: AgentEntry = { ...runningAgent, id: 'r2' };
        const ctx = makeContext([runningAgent, completedAgent, extra]);
        const listItem: WidgetItem = { ...item, metadata: { mode: 'list' } };
        expect(widget.render(listItem, ctx, DEFAULT_SETTINGS))
            .toBe('Agents: explore ×2, code-reviewer ×1');
    });
});

describe('AgentActivityWidget.render — legacy metadata', () => {
    const widget = new AgentActivityWidget();
    const runningAgent: AgentEntry = { id: 'r1', type: 'explore', status: 'running', startTime: new Date(Date.now() - 1000) };
    const completedAgent: AgentEntry = { id: 'c1', type: 'code-reviewer', status: 'completed', startTime: new Date(Date.now() - 3000), endTime: new Date(Date.now() - 2000) };

    it('maps legacy mode "mixed" to activity', () => {
        const legacy: WidgetItem = { id: 'a', type: 'agent-activity', metadata: { mode: 'mixed' } };
        const output = widget.render(legacy, makeContext([runningAgent, completedAgent]), DEFAULT_SETTINGS);
        expect(output).toContain('◐ explore');
        expect(output).toContain('✓ code-reviewer');
    });

    it('maps legacy mode "active" to activity + hideCompleted', () => {
        const legacy: WidgetItem = { id: 'a', type: 'agent-activity', metadata: { mode: 'active' } };
        const output = widget.render(legacy, makeContext([runningAgent, completedAgent]), DEFAULT_SETTINGS);
        expect(output).toContain('◐ explore');
        expect(output).not.toContain('✓');
    });

    it('maps legacy mode "last" to current', () => {
        const legacy: WidgetItem = { id: 'a', type: 'agent-activity', metadata: { mode: 'last' } };
        const output = widget.render(legacy, makeContext([runningAgent, completedAgent]), DEFAULT_SETTINGS);
        expect(output).toContain('code-reviewer');
        expect(output).not.toContain('explore');
    });
});

describe('AgentActivityWidget.render — rawValue and empty', () => {
    const widget = new AgentActivityWidget();

    it('rawValue=true strips "Agents:" label and icons', () => {
        const agent: AgentEntry = {
            id: 'a',
            type: 'explore',
            model: 'haiku',
            description: 'Finding auth',
            status: 'running',
            startTime: new Date(Date.now() - 12_000)
        };
        const item: WidgetItem = { id: 'a', type: 'agent-activity', rawValue: true };
        const output = widget.render(item, makeContext([agent]), DEFAULT_SETTINGS);
        expect(output).not.toMatch(/^Agents: /);
        expect(output).not.toContain('◐');
        expect(output).toContain('explore [haiku]');
    });

    it('returns "Agents: none" for empty agents when hideWhenEmpty off', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity' };
        expect(widget.render(item, makeContext([]), DEFAULT_SETTINGS))
            .toBe('Agents: none');
    });

    it('returns null for empty agents when hideWhenEmpty on', () => {
        const item: WidgetItem = {
            id: 'a',
            type: 'agent-activity',
            metadata: { hideWhenEmpty: 'true' }
        };
        expect(widget.render(item, makeContext([]), DEFAULT_SETTINGS))
            .toBeNull();
    });

    it('returns empty string for empty agents when rawValue=true and hideWhenEmpty off', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity', rawValue: true };
        expect(widget.render(item, makeContext([]), DEFAULT_SETTINGS))
            .toBe('');
    });

    it('count mode returns "Agents: 0" when no agents (hideWhenEmpty off)', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity', metadata: { mode: 'count' } };
        expect(widget.render(item, makeContext([]), DEFAULT_SETTINGS)).toBe('Agents: 0');
    });

    it('count mode with hideWhenEmpty returns null when 0', () => {
        const item: WidgetItem = {
            id: 'a',
            type: 'agent-activity',
            metadata: { mode: 'count', hideWhenEmpty: 'true' }
        };
        expect(widget.render(item, makeContext([]), DEFAULT_SETTINGS)).toBeNull();
    });
});

describe('AgentActivityWidget.render — preview', () => {
    const widget = new AgentActivityWidget();

    it('activity preview contains both running and completed samples', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity' };
        const output = widget.render(item, makeContext([], true), DEFAULT_SETTINGS) ?? '';
        expect(output).toMatch(/^Agents: /);
        expect(output).toContain('◐ explore');
        expect(output).toContain('✓ code-reviewer');
    });

    it('activity preview with hideCompleted contains only running sample', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity', metadata: { hideCompleted: 'true' } };
        const output = widget.render(item, makeContext([], true), DEFAULT_SETTINGS) ?? '';
        expect(output).toContain('◐ explore');
        expect(output).not.toContain('✓');
    });

    it('current preview shows one completed sample', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity', metadata: { mode: 'current' } };
        const output = widget.render(item, makeContext([], true), DEFAULT_SETTINGS) ?? '';
        expect(output).toContain('✓ code-reviewer');
        expect(output).not.toContain('◐');
    });

    it('count preview shows a numeric sample', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity', metadata: { mode: 'count' } };
        expect(widget.render(item, makeContext([], true), DEFAULT_SETTINGS)).toBe('Agents: 3');
    });

    it('list preview shows aggregated sample', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity', metadata: { mode: 'list' } };
        expect(widget.render(item, makeContext([], true), DEFAULT_SETTINGS))
            .toBe('Agents: explore ×2, code-reviewer ×1');
    });

    it('rawValue preview omits "Agents:" prefix', () => {
        const item: WidgetItem = { id: 'a', type: 'agent-activity', rawValue: true };
        const output = widget.render(item, makeContext([], true), DEFAULT_SETTINGS) ?? '';
        expect(output).not.toMatch(/^Agents: /);
    });
});

describe('AgentActivityWidget.getCustomKeybinds', () => {
    const widget = new AgentActivityWidget();
    const base: WidgetItem = { id: 'a', type: 'agent-activity' };

    it('uses collision-free keys (avoids ItemsEditor-reserved a/i/d/c/r/m)', () => {
        const RESERVED = new Set(['a', 'i', 'd', 'c', 'r', 'm']);
        const modes = [undefined, 'current', 'count', 'list', 'activity'] as const;
        for (const mode of modes) {
            const item: WidgetItem = mode ? { ...base, metadata: { mode } } : base;
            for (const kb of widget.getCustomKeybinds(item)) {
                expect(RESERVED.has(kb.key)).toBe(false);
            }
        }
    });

    it('includes l and u keys in activity mode (default)', () => {
        const keys = widget.getCustomKeybinds(base).map(k => k.key);
        expect(keys).toEqual(['v', 'o', 't', 'e', 'h', 'l', 'u']);
    });

    it('includes l but not u key in list mode', () => {
        const item = { ...base, metadata: { mode: 'list' } };
        const keys = widget.getCustomKeybinds(item).map(k => k.key);
        expect(keys).toContain('l');
        expect(keys).not.toContain('u');
    });

    it('omits l and u keys in current mode', () => {
        const item = { ...base, metadata: { mode: 'current' } };
        const keys = widget.getCustomKeybinds(item).map(k => k.key);
        expect(keys).not.toContain('l');
        expect(keys).not.toContain('u');
    });

    it('omits l and u keys in count mode', () => {
        const item = { ...base, metadata: { mode: 'count' } };
        const keys = widget.getCustomKeybinds(item).map(k => k.key);
        expect(keys).not.toContain('l');
        expect(keys).not.toContain('u');
    });

    it('includes expected actions', () => {
        const keybinds = widget.getCustomKeybinds(base);
        const actions = keybinds.map(k => k.action);
        expect(actions).toContain('cycle-mode');
        expect(actions).toContain('toggle-hide-model');
        expect(actions).toContain('toggle-hide-description');
        expect(actions).toContain('toggle-hide-elapsed');
        expect(actions).toContain('toggle-hide-completed');
        expect(actions).toContain('toggle-hide-empty');
        expect(actions).toContain('edit-limit');
    });
});

describe('AgentActivityWidget.handleEditorAction', () => {
    const widget = new AgentActivityWidget();
    const base: WidgetItem = { id: 'a', type: 'agent-activity' };

    it('cycle-mode progresses activity → current → count → list → activity', () => {
        // default mode is 'activity'
        const a = widget.handleEditorAction('cycle-mode', base);
        expect(a?.metadata?.mode).toBe('current');
        const b = widget.handleEditorAction('cycle-mode', a ?? base);
        expect(b?.metadata?.mode).toBe('count');
        const c = widget.handleEditorAction('cycle-mode', b ?? base);
        expect(c?.metadata?.mode).toBe('list');
        const d = widget.handleEditorAction('cycle-mode', c ?? base);
        expect(d?.metadata?.mode).toBe('activity');
    });

    it('toggle-hide-model flips flag', () => {
        const a = widget.handleEditorAction('toggle-hide-model', base);
        expect(a?.metadata?.hideModel).toBe('true');
        const b = widget.handleEditorAction('toggle-hide-model', a ?? base);
        expect(b?.metadata?.hideModel).toBe('false');
    });

    it('toggle-hide-description flips flag', () => {
        const a = widget.handleEditorAction('toggle-hide-description', base);
        expect(a?.metadata?.hideDescription).toBe('true');
    });

    it('toggle-hide-elapsed flips flag', () => {
        const a = widget.handleEditorAction('toggle-hide-elapsed', base);
        expect(a?.metadata?.hideElapsed).toBe('true');
    });

    it('toggle-hide-completed flips flag', () => {
        const a = widget.handleEditorAction('toggle-hide-completed', base);
        expect(a?.metadata?.hideCompleted).toBe('true');
    });

    it('toggle-hide-empty flips flag', () => {
        const a = widget.handleEditorAction('toggle-hide-empty', base);
        expect(a?.metadata?.hideWhenEmpty).toBe('true');
    });

    it('returns null for unknown action', () => {
        expect(widget.handleEditorAction('unknown-action', base)).toBeNull();
    });
});

describe('AgentActivityWidget.getEditorDisplay', () => {
    const widget = new AgentActivityWidget();

    it('shows activity label by default', () => {
        const display = widget.getEditorDisplay({ id: 'a', type: 'agent-activity' });
        expect(display.displayText).toBe('Agent Activity');
        expect(display.modifierText).toBe('(activity)');
    });

    it('shows current label for current mode', () => {
        const display = widget.getEditorDisplay({ id: 'a', type: 'agent-activity', metadata: { mode: 'current' } });
        expect(display.modifierText).toBe('(current)');
    });

    it('shows count label for count mode', () => {
        const display = widget.getEditorDisplay({ id: 'a', type: 'agent-activity', metadata: { mode: 'count' } });
        expect(display.modifierText).toBe('(count)');
    });

    it('shows list label for list mode', () => {
        const display = widget.getEditorDisplay({ id: 'a', type: 'agent-activity', metadata: { mode: 'list' } });
        expect(display.modifierText).toBe('(list)');
    });

    it('appends running only when hideCompleted set on activity mode', () => {
        const display = widget.getEditorDisplay({
            id: 'a',
            type: 'agent-activity',
            metadata: { mode: 'activity', hideCompleted: 'true' }
        });
        expect(display.modifierText).toBe('(activity, running only)');
    });

    it('legacy mode=active resolves to activity + running only', () => {
        const display = widget.getEditorDisplay({ id: 'a', type: 'agent-activity', metadata: { mode: 'active' } });
        expect(display.modifierText).toBe('(activity, running only)');
    });

    it('appends limit when non-default in activity mode', () => {
        const display = widget.getEditorDisplay({
            id: 'a',
            type: 'agent-activity',
            metadata: { limit: '5' }
        });
        expect(display.modifierText).toBe('(activity, limit: 5)');
    });

    it('shows limit: ∞ when limit is 0', () => {
        const display = widget.getEditorDisplay({
            id: 'a',
            type: 'agent-activity',
            metadata: { limit: '0' }
        });
        expect(display.modifierText).toBe('(activity, limit: ∞)');
    });

    it('omits limit modifier when limit equals default (3)', () => {
        const display = widget.getEditorDisplay({
            id: 'a',
            type: 'agent-activity',
            metadata: { limit: '3' }
        });
        expect(display.modifierText).toBe('(activity)');
    });

    it('omits limit modifier in count or current modes', () => {
        const count = widget.getEditorDisplay({ id: 'a', type: 'agent-activity', metadata: { mode: 'count', limit: '5' } });
        expect(count.modifierText).toBe('(count)');
        const current = widget.getEditorDisplay({ id: 'a', type: 'agent-activity', metadata: { mode: 'current', limit: '5' } });
        expect(current.modifierText).toBe('(current)');
    });

    it('appends hideXxx flags', () => {
        const display = widget.getEditorDisplay({
            id: 'a',
            type: 'agent-activity',
            metadata: {
                hideModel: 'true',
                hideDescription: 'true',
                hideElapsed: 'true'
            }
        });
        expect(display.modifierText).toBe('(activity, no model, no desc, no elapsed)');
    });

    it('appends hide when empty', () => {
        const display = widget.getEditorDisplay({
            id: 'a',
            type: 'agent-activity',
            metadata: { hideWhenEmpty: 'true' }
        });
        expect(display.modifierText).toBe('(activity, hide when empty)');
    });
});