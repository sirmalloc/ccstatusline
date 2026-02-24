import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    isInsideJjRepo,
    runJj
} from '../utils/jj';

export class JjWorkspaceWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the current jujutsu workspace name'; }
    getDisplayName(): string { return 'JJ Workspace'; }
    getCategory(): string { return 'Jujutsu'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hideNoJj = item.metadata?.hideNoJj === 'true';
        const modifiers: string[] = [];

        if (hideNoJj) {
            modifiers.push('hide \'no jj\'');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-nojj') {
            const currentState = item.metadata?.hideNoJj === 'true';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    hideNoJj: (!currentState).toString()
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoJj = item.metadata?.hideNoJj === 'true';

        if (context.isPreview) {
            return item.rawValue ? 'default' : '◆ default';
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : '◆ no jj';
        }

        const workspace = this.getJjWorkspace(context);
        if (workspace) {
            return item.rawValue ? workspace : `◆ ${workspace}`;
        }

        return hideNoJj ? null : '◆ no jj';
    }

    private getJjWorkspace(context: RenderContext): string | null {
        const output = runJj('workspace list', context);
        if (!output) {
            return null;
        }

        const activeMatch = /^(\S+):\s/.exec(output);
        if (activeMatch?.[1]) {
            return activeMatch[1];
        }

        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no jj\' message', action: 'toggle-nojj' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
