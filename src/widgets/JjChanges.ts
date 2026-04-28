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
    runJjArgs
} from '../utils/jj';

export class JjChangesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows jujutsu changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'JJ Changes'; }
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
            return '(+42,-10)';
        }

        if (!isInsideJjRepo(context)) {
            return hideNoJj ? null : '(no jj)';
        }

        const changes = this.getJjChanges(context);
        if (changes) {
            return `(+${changes.insertions},-${changes.deletions})`;
        }

        return hideNoJj ? null : '(no jj)';
    }

    private getJjChanges(context: RenderContext): { insertions: number; deletions: number } | null {
        const stat = runJjArgs(['diff', '--stat'], context);

        let totalInsertions = 0;
        let totalDeletions = 0;

        if (stat) {
            const lines = stat.split('\n');
            const summaryLine = lines[lines.length - 1];
            if (summaryLine) {
                const insertMatch = /(\d+) insertion/.exec(summaryLine);
                const deleteMatch = /(\d+) deletion/.exec(summaryLine);
                totalInsertions += insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0;
                totalDeletions += deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0;
            }
        }

        return { insertions: totalInsertions, deletions: totalDeletions };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no jj\' message', action: 'toggle-nojj' }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(): boolean { return true; }
}
