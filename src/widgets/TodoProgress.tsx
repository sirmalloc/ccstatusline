import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type { TodoItem } from '../types/TodoProgressMetrics';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import type { WidgetHookDef } from '../utils/hooks';

import { makeModifierText } from './shared/editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';

const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';
const HIDE_PROGRESS_KEY = 'hideProgress';
const HIDE_CONTENT_KEY = 'hideContent';

const TOGGLE_HIDE_EMPTY_ACTION = 'toggle-hide-empty';
const TOGGLE_HIDE_PROGRESS_ACTION = 'toggle-hide-progress';
const TOGGLE_HIDE_CONTENT_ACTION = 'toggle-hide-content';

export interface TodoDisplayFlags {
    hideProgress: boolean;
    hideContent: boolean;
}

function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen)
        return text;
    return `${text.slice(0, maxLen - 3)}...`;
}

export function formatTodoProgress(
    todos: TodoItem[],
    flags: TodoDisplayFlags,
    rawValue: boolean
): string {
    if (todos.length === 0) {
        return rawValue ? '' : 'Todo: none';
    }

    const completed = todos.filter(t => t.status === 'completed').length;
    const total = todos.length;
    const progress = `${completed}/${total}`;
    const inProgress = todos.find(t => t.status === 'in_progress');

    if (inProgress) {
        if (flags.hideContent) {
            const body = flags.hideProgress ? 'in progress' : `${progress} in progress`;
            return rawValue ? body : `Todo: ${body}`;
        }
        const content = truncate(inProgress.content, 40);
        const body = flags.hideProgress ? content : `${content} (${progress})`;
        return rawValue ? body : `▸ ${body}`;
    }

    const body = flags.hideProgress ? 'done' : `${progress} done`;
    return rawValue ? body : `Todo: ${body}`;
}

export class TodoProgressWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string {
        return 'Shows current in-progress todo and completion ratio from TodoWrite';
    }

    getDisplayName(): string { return 'Todo Progress'; }
    getCategory(): string { return 'Session'; }
    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }

    getHooks(): WidgetHookDef[] {
        return [{ event: 'PostToolUse', matcher: 'TodoWrite' }];
    }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [];
        if (this.shouldHideContent(item)) {
            modifiers.push('no content');
        }
        if (this.shouldHideProgress(item)) {
            modifiers.push('no progress');
        }
        if (this.isHideWhenEmptyEnabled(item)) {
            modifiers.push('hide when empty');
        }
        return {
            displayText: 'Todo Progress',
            modifierText: makeModifierText(modifiers)
        };
    }

    getCustomKeybinds(_item?: WidgetItem): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress', action: TOGGLE_HIDE_PROGRESS_ACTION },
            { key: 't', label: '(t)ext', action: TOGGLE_HIDE_CONTENT_ACTION },
            { key: 'h', label: '(h)ide when empty', action: TOGGLE_HIDE_EMPTY_ACTION }
        ];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_HIDE_PROGRESS_ACTION) {
            return toggleMetadataFlag(item, HIDE_PROGRESS_KEY);
        }
        if (action === TOGGLE_HIDE_CONTENT_ACTION) {
            return toggleMetadataFlag(item, HIDE_CONTENT_KEY);
        }
        if (action === TOGGLE_HIDE_EMPTY_ACTION) {
            return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const rawValue = item.rawValue === true;
        const flags: TodoDisplayFlags = {
            hideProgress: this.shouldHideProgress(item),
            hideContent: this.shouldHideContent(item)
        };

        if (context.isPreview) {
            return formatTodoProgress(
                [
                    { content: 'Write tests', status: 'completed' },
                    { content: 'Fix authentication bug', status: 'in_progress' },
                    { content: 'Add docs', status: 'pending' },
                    { content: 'Ship release', status: 'pending' },
                    { content: 'Cleanup', status: 'pending' }
                ],
                flags,
                rawValue
            );
        }

        const todos = context.todoProgressMetrics?.todos ?? [];
        if (todos.length === 0) {
            if (this.isHideWhenEmptyEnabled(item))
                return null;
            return rawValue ? '' : 'Todo: none';
        }

        return formatTodoProgress(todos, flags, rawValue);
    }

    private shouldHideProgress(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_PROGRESS_KEY);
    }

    private shouldHideContent(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_CONTENT_KEY);
    }

    private isHideWhenEmptyEnabled(item: WidgetItem): boolean {
        return isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY);
    }
}