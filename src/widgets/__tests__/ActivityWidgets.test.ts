import {
    describe,
    expect,
    it
} from 'vitest';

import type { ActivitySnapshot } from '../../types/Activity';
import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { ActivityWidget } from '../Activity';
import { AgentsActivityWidget } from '../AgentsActivity';
import { TodoProgressWidget } from '../TodoProgress';
import { ToolsActivityWidget } from '../ToolsActivity';

const baseSnapshot: ActivitySnapshot = {
    tools: [
        {
            id: 'tool-1',
            name: 'Edit',
            target: '/repo/src/auth.ts',
            status: 'running',
            startTime: new Date(Date.now() - 20_000)
        },
        {
            id: 'tool-2',
            name: 'Read',
            status: 'completed',
            startTime: new Date(Date.now() - 50_000),
            endTime: new Date(Date.now() - 45_000)
        },
        {
            id: 'tool-3',
            name: 'Read',
            status: 'completed',
            startTime: new Date(Date.now() - 40_000),
            endTime: new Date(Date.now() - 35_000)
        }
    ],
    agents: [
        {
            id: 'agent-1',
            type: 'explore',
            model: 'haiku',
            description: 'Investigating auth code path',
            status: 'running',
            startTime: new Date(Date.now() - 75_000)
        },
        {
            id: 'agent-2',
            type: 'reviewer',
            status: 'completed',
            startTime: new Date(Date.now() - 140_000),
            endTime: new Date(Date.now() - 95_000)
        }
    ],
    todos: [
        { content: 'Investigate auth bug', status: 'in_progress' },
        { content: 'Add tests', status: 'completed' },
        { content: 'Update docs', status: 'pending' }
    ],
    updatedAt: new Date()
};

function renderWithContext(widget: { render: (item: WidgetItem, context: RenderContext, settings: typeof DEFAULT_SETTINGS) => string | null }, item: WidgetItem, context: RenderContext): string | null {
    return widget.render(item, context, DEFAULT_SETTINGS);
}

describe('Activity widgets', () => {
    it('ToolsActivityWidget renders running and completed summary', () => {
        const widget = new ToolsActivityWidget();
        const output = renderWithContext(widget, { id: 'tools', type: 'tools-activity' }, { activity: baseSnapshot });

        expect(output).toContain('Tools:');
        expect(output).toContain('◐ Edit');
        expect(output).toContain('✓ Read ×2');
    });

    it('AgentsActivityWidget renders running and recently completed agents', () => {
        const widget = new AgentsActivityWidget();
        const output = renderWithContext(widget, { id: 'agents', type: 'agents-activity' }, { activity: baseSnapshot });

        expect(output).toContain('Agents:');
        expect(output).toContain('◐ explore [haiku]');
        expect(output).toContain('✓ reviewer');
    });

    it('TodoProgressWidget renders in-progress todo with completion ratio', () => {
        const widget = new TodoProgressWidget();
        const output = renderWithContext(widget, { id: 'todo', type: 'todo-progress' }, { activity: baseSnapshot });

        expect(output).toContain('Todo:');
        expect(output).toContain('▸ Investigate auth bug');
        expect(output).toContain('(1/3)');
    });

    it('TodoProgressWidget renders all complete state', () => {
        const widget = new TodoProgressWidget();
        const output = renderWithContext(
            widget,
            { id: 'todo', type: 'todo-progress' },
            {
                activity: {
                    ...baseSnapshot,
                    todos: [
                        { content: 'A', status: 'completed' },
                        { content: 'B', status: 'completed' }
                    ]
                }
            }
        );

        expect(output).toBe('Todo: ✓ All complete (2/2)');
    });

    it('ActivityWidget renders running-first compact summary and counters', () => {
        const widget = new ActivityWidget();
        const output = renderWithContext(widget, { id: 'activity', type: 'activity' }, { activity: baseSnapshot });

        expect(output).toContain('All Activity:');
        expect(output).toContain('◐ Edit');
        expect(output).toContain('◐ explore');
        expect(output).toContain('▸ Investigate auth bug');
        expect(output).toContain('✓T2');
        expect(output).toContain('✓A1');
        expect(output).toContain('TD1/3');
    });

    it('all activity widgets support width keybind and optional truncation', () => {
        const widgets = [
            new ToolsActivityWidget(),
            new AgentsActivityWidget(),
            new TodoProgressWidget(),
            new ActivityWidget()
        ];

        for (const widget of widgets) {
            expect(widget.getCustomKeybinds()).toEqual([
                { key: 'w', label: '(w)idth', action: 'edit-width' }
            ]);

            const output = renderWithContext(
                widget,
                { id: 'x', type: 'activity', maxWidth: 20 },
                { activity: baseSnapshot }
            );

            expect(output).not.toBeNull();
            expect(output?.endsWith('...')).toBe(true);
        }
    });

    it('all activity widgets return preview output in preview mode', () => {
        const tools = renderWithContext(new ToolsActivityWidget(), { id: 'tools', type: 'tools-activity' }, { isPreview: true });
        const agents = renderWithContext(new AgentsActivityWidget(), { id: 'agents', type: 'agents-activity' }, { isPreview: true });
        const todo = renderWithContext(new TodoProgressWidget(), { id: 'todo', type: 'todo-progress' }, { isPreview: true });
        const activity = renderWithContext(new ActivityWidget(), { id: 'activity', type: 'activity' }, { isPreview: true });

        expect(tools).toContain('Tools:');
        expect(agents).toContain('Agents:');
        expect(todo).toContain('Todo:');
        expect(activity).toContain('All Activity:');
    });
});