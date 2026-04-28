import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getJjChangeCounts,
    isInsideJjRepo
} from '../utils/jj';

export class JjInsertionsWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows jujutsu insertions count'; }
    getDisplayName(): string { return 'JJ Insertions'; }
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
            return '+42';
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : '(no jj)';
        }

        const changes = getJjChangeCounts(context);
        return `+${changes.insertions}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no jj\' message', action: 'toggle-nojj' }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
