import {
    describe,
    expect,
    it
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { TodoItem } from '../../types/TodoProgressMetrics';
import type { WidgetItem } from '../../types/Widget';
import {
    TodoProgressWidget,
    formatTodoProgress
} from '../TodoProgress';

function makeItem(overrides: Partial<WidgetItem> = {}): WidgetItem {
    return { id: 'w1', type: 'todo-progress', ...overrides };
}

function makeContext(todos: TodoItem[], overrides: Partial<RenderContext> = {}): RenderContext {
    return {
        todoProgressMetrics: { todos, timestamp: '2026-04-19T10:00:00.000Z' },
        ...overrides
    };
}

const settings = {} as Settings;

describe('formatTodoProgress', () => {
    const off = { hideProgress: false, hideContent: false };

    it('returns Todo: none when todos empty', () => {
        expect(formatTodoProgress([], off, false)).toBe('Todo: none');
    });

    it('returns empty string when empty and rawValue', () => {
        expect(formatTodoProgress([], off, true)).toBe('');
    });

    it('formats in_progress with progress by default', () => {
        const todos: TodoItem[] = [
            { content: 'Fix auth', status: 'in_progress' },
            { content: 'Ship', status: 'pending' },
            { content: 'Done', status: 'completed' }
        ];
        expect(formatTodoProgress(todos, off, false)).toBe('▸ Fix auth (1/3)');
    });

    it('omits icon and label in rawValue for in_progress', () => {
        const todos: TodoItem[] = [
            { content: 'Fix auth', status: 'in_progress' },
            { content: 'Ship', status: 'pending' }
        ];
        expect(formatTodoProgress(todos, off, true)).toBe('Fix auth (0/2)');
    });

    it('truncates long in_progress content at 40 chars', () => {
        const long = 'a'.repeat(60);
        const todos: TodoItem[] = [{ content: long, status: 'in_progress' }];
        const out = formatTodoProgress(todos, off, false);
        expect(out).toBe(`▸ ${`a`.repeat(37)}... (0/1)`);
    });

    it('hideProgress strips the ratio', () => {
        const todos: TodoItem[] = [
            { content: 'Fix auth', status: 'in_progress' }
        ];
        expect(formatTodoProgress(todos, { hideProgress: true, hideContent: false }, false))
            .toBe('▸ Fix auth');
    });

    it('hideContent replaces content with in progress label', () => {
        const todos: TodoItem[] = [
            { content: 'Fix auth', status: 'in_progress' },
            { content: 'Ship', status: 'completed' }
        ];
        expect(formatTodoProgress(todos, { hideProgress: false, hideContent: true }, false))
            .toBe('Todo: 1/2 in progress');
    });

    it('hideContent + hideProgress collapses to in progress', () => {
        const todos: TodoItem[] = [
            { content: 'Fix auth', status: 'in_progress' }
        ];
        expect(formatTodoProgress(todos, { hideProgress: true, hideContent: true }, false))
            .toBe('Todo: in progress');
    });

    it('without any in_progress shows done ratio', () => {
        const todos: TodoItem[] = [
            { content: 'A', status: 'completed' },
            { content: 'B', status: 'pending' }
        ];
        expect(formatTodoProgress(todos, off, false)).toBe('Todo: 1/2 done');
    });

    it('without in_progress + hideProgress shows bare done', () => {
        const todos: TodoItem[] = [{ content: 'A', status: 'completed' }];
        expect(formatTodoProgress(todos, { hideProgress: true, hideContent: false }, false))
            .toBe('Todo: done');
    });

    it('rawValue strips Todo: label for done state', () => {
        const todos: TodoItem[] = [{ content: 'A', status: 'completed' }];
        expect(formatTodoProgress(todos, off, true)).toBe('1/1 done');
    });
});

describe('TodoProgressWidget', () => {
    const widget = new TodoProgressWidget();

    it('reports static metadata', () => {
        expect(widget.getDisplayName()).toBe('Todo Progress');
        expect(widget.getCategory()).toBe('Session');
        expect(widget.getDefaultColor()).toBe('yellow');
        expect(widget.supportsRawValue()).toBe(true);
    });

    it('registers PostToolUse+TodoWrite and UserPromptSubmit (turn marker) hooks', () => {
        expect(widget.getHooks()).toEqual([
            { event: 'PostToolUse', matcher: 'TodoWrite' },
            { event: 'UserPromptSubmit' }
        ]);
    });

    it('returns preview output in preview mode', () => {
        const result = widget.render(makeItem(), { isPreview: true }, settings);
        expect(result).toBe('▸ Fix authentication bug (1/5)');
    });

    it('renders Todo: none when no metrics', () => {
        expect(widget.render(makeItem(), {}, settings)).toBe('Todo: none');
    });

    it('returns null when empty and hideWhenEmpty is on', () => {
        const item = makeItem({ metadata: { hideWhenEmpty: 'true' } });
        expect(widget.render(item, {}, settings)).toBeNull();
    });

    it('renders in_progress with progress from context', () => {
        const ctx = makeContext([
            { content: 'Fix bug', status: 'in_progress' },
            { content: 'Ship', status: 'pending' }
        ]);
        expect(widget.render(makeItem(), ctx, settings)).toBe('▸ Fix bug (0/2)');
    });

    it('respects hideProgress metadata', () => {
        const ctx = makeContext([{ content: 'Fix bug', status: 'in_progress' }]);
        const item = makeItem({ metadata: { hideProgress: 'true' } });
        expect(widget.render(item, ctx, settings)).toBe('▸ Fix bug');
    });

    it('respects hideContent metadata', () => {
        const ctx = makeContext([
            { content: 'Fix bug', status: 'in_progress' },
            { content: 'Ship', status: 'completed' }
        ]);
        const item = makeItem({ metadata: { hideContent: 'true' } });
        expect(widget.render(item, ctx, settings)).toBe('Todo: 1/2 in progress');
    });

    it('cycles toggle handlers', () => {
        const base = makeItem();
        const afterP = widget.handleEditorAction('toggle-hide-progress', base);
        expect(afterP?.metadata?.hideProgress).toBe('true');
        const afterC = widget.handleEditorAction('toggle-hide-content', base);
        expect(afterC?.metadata?.hideContent).toBe('true');
        const afterH = widget.handleEditorAction('toggle-hide-empty', base);
        expect(afterH?.metadata?.hideWhenEmpty).toBe('true');
        expect(widget.handleEditorAction('unknown', base)).toBeNull();
    });

    it('builds editor display modifiers in order', () => {
        const item = makeItem({ metadata: { hideContent: 'true', hideProgress: 'true', hideWhenEmpty: 'true' } });
        const display = widget.getEditorDisplay(item);
        expect(display.displayText).toBe('Todo Progress');
        expect(display.modifierText).toBe('(no content, no progress, hide when empty)');
    });

    it('returns no modifiers when flags clean', () => {
        expect(widget.getEditorDisplay(makeItem()).modifierText).toBeUndefined();
    });

    it('surfaces stale minutes in editor modifier when configured', () => {
        const item = makeItem({ metadata: { staleMinutes: '30' } });
        expect(widget.getEditorDisplay(item).modifierText).toBe('(stale: 30m)');
    });

    it('treats snapshot as empty when staleMinutes exceeded', () => {
        const oldTimestamp = new Date(Date.now() - 60 * 60_000).toISOString();  // 60 min ago
        const ctx: RenderContext = {
            todoProgressMetrics: {
                todos: [{ content: 'Stale task', status: 'in_progress' }],
                timestamp: oldTimestamp
            }
        };
        const item = makeItem({ metadata: { staleMinutes: '30' } });  // 30 min threshold
        expect(widget.render(item, ctx, settings)).toBe('Todo: none');
    });

    it('keeps snapshot when within staleMinutes window', () => {
        const recent = new Date(Date.now() - 10 * 60_000).toISOString();  // 10 min ago
        const ctx: RenderContext = {
            todoProgressMetrics: {
                todos: [{ content: 'Fresh task', status: 'in_progress' }],
                timestamp: recent
            }
        };
        const item = makeItem({ metadata: { staleMinutes: '30' } });
        expect(widget.render(item, ctx, settings)).toBe('▸ Fresh task (0/1)');
    });

    it('staleMinutes=0 disables the check', () => {
        const ancient = new Date(2020, 0, 1).toISOString();
        const ctx: RenderContext = {
            todoProgressMetrics: {
                todos: [{ content: 'Old but not stale', status: 'in_progress' }],
                timestamp: ancient
            }
        };
        const item = makeItem({ metadata: { staleMinutes: '0' } });
        expect(widget.render(item, ctx, settings)).toBe('▸ Old but not stale (0/1)');
    });
});