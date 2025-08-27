import * as path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class CurrentActiveWorkingDirWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current active working directory'; }
    getDisplayName(): string { return 'Current Active Working Dir'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const showAbsolute = item.metadata?.showAbsolute === 'true';
        const modifiers: string[] = [];

        if (showAbsolute) {
            modifiers.push('absolute');
        } else {
            modifiers.push('relative');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-absolute') {
            const currentState = item.metadata?.showAbsolute === 'true';

            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    showAbsolute: (!currentState).toString()
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        const showAbsolute = item.metadata?.showAbsolute === 'true';

        if (context.isPreview) {
            const value = showAbsolute ? '/Users/example/project/folder' : './folder';
            return item.rawValue ? value : `dir: ${value}`;
        }

        // return "TODO";

        const cwd = context.data?.cwd;
        const activeWorkingDir = context.cwd ?? cwd;

        if (activeWorkingDir)  {
            const value = showAbsolute || !cwd ? activeWorkingDir : path.relative(cwd, activeWorkingDir);

            return item.rawValue ? value : `dir: ${value}`;
        }

        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 't', label: '(t)oggle absolute path', action: 'toggle-absolute' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}