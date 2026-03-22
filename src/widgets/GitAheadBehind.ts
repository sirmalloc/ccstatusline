import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getGitAheadBehind,
    isInsideGitWorkTree
} from '../utils/git';

import { makeModifierText } from './shared/editor-display';
import {
    getHideNoGitKeybinds,
    getHideNoGitModifierText,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';

export class GitAheadBehindWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows commits ahead/behind upstream (↑2↓3)'; }
    getDisplayName(): string { return 'Git Ahead/Behind'; }
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
                return '2,3';
            return '↑2↓3';
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const result = getGitAheadBehind(context);
        if (!result) {
            return hideNoGit ? null : '(no upstream)';
        }

        // Hide if both are zero
        if (result.ahead === 0 && result.behind === 0) {
            return null;
        }

        if (item.rawValue) {
            return `${result.ahead},${result.behind}`;
        }

        const parts: string[] = [];
        if (result.ahead > 0)
            parts.push(`↑${result.ahead}`);
        if (result.behind > 0)
            parts.push(`↓${result.behind}`);

        return parts.join('');
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getHideNoGitKeybinds();
    }

    getNumericValue(context: RenderContext, _item: WidgetItem): number | null {
        if (!isInsideGitWorkTree(context))
            return null;
        const result = getGitAheadBehind(context);
        if (!result)
            return null;
        // Return total divergence (ahead + behind)
        return result.ahead + result.behind;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}