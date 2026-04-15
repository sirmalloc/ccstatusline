import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import { DEFAULT_SETTINGS } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getGitConflictCount,
    isInsideGitWorkTree
} from '../utils/git';
import { parseIntSafe } from '../utils/value-parsers';

import { makeModifierText } from './shared/editor-display';
import {
    getHideNoGitKeybinds,
    getHideNoGitModifierText,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';

export class GitConflictsWidget implements Widget {
    getDefaultColor(): string { return 'red'; }
    getDescription(): string { return 'Shows count of merge conflicts'; }
    getDisplayName(): string { return 'Git Conflicts'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [];
        const noGitText = getHideNoGitModifierText(item);
        if (noGitText)
            modifiers.push('hide \'no git\'');

        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleToggleNoGitAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHideNoGitEnabled(item);

        if (context.isPreview) {
            if (item.rawValue)
                return '2';
            return '⚠ 2';
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const count = getGitConflictCount(context);

        if (item.rawValue) {
            return count.toString();
        }

        return `⚠ ${count}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoGitKeybinds();
    }

    getValueType(): 'number' {
        return 'number';
    }

    getValue(context: RenderContext, item: WidgetItem): number | null {
        const rendered = this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS);
        if (!rendered) return null;
        return parseIntSafe(rendered);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}