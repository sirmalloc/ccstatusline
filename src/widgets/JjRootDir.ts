import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    isInsideJjWorkspace,
    runJj
} from '../utils/jj';

import {
    getHideNoJjKeybinds,
    getHideNoJjModifierText,
    handleToggleNoJjAction,
    isHideNoJjEnabled
} from './shared/jj-no-jj';

export class JjRootDirWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the jj workspace root directory name'; }
    getDisplayName(): string { return 'JJ Root Dir'; }
    getCategory(): string { return 'Jujutsu'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getHideNoJjModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleToggleNoJjAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoJj = isHideNoJjEnabled(item);

        if (context.isPreview) {
            return 'my-repo';
        }

        if (!isInsideJjWorkspace(context)) {
            return hideNoJj ? null : 'no jj';
        }

        const rootDir = runJj('workspace root', context);
        if (rootDir) {
            return this.getRootDirName(rootDir);
        }

        return hideNoJj ? null : 'no jj';
    }

    private getRootDirName(rootDir: string): string {
        const trimmedRootDir = rootDir.replace(/[\\/]+$/, '');
        const normalizedRootDir = trimmedRootDir.length > 0 ? trimmedRootDir : rootDir;
        const parts = normalizedRootDir.split(/[\\/]/).filter(Boolean);
        const lastPart = parts[parts.length - 1];
        return lastPart && lastPart.length > 0 ? lastPart : normalizedRootDir;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoJjKeybinds();
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}