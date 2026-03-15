import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    isInsideGitWorkTree,
    runGit
} from '../utils/git';
import {
    encodeGitRefForUrlPath,
    parseGitHubBaseUrl,
    renderOsc8Link
} from '../utils/hyperlink';

import { makeModifierText } from './shared/editor-display';
import {
    getHideNoGitKeybinds,
    getHideNoGitModifierText,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';

const LINK_KEY = 'linkToGitHub';
const TOGGLE_LINK_ACTION = 'toggle-link';

export class GitBranchWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current git branch name'; }
    getDisplayName(): string { return 'Git Branch'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const isLink = isMetadataFlagEnabled(item, LINK_KEY);
        const modifiers: string[] = [];
        const noGitText = getHideNoGitModifierText(item);
        if (noGitText)
            modifiers.push('hide \'no git\'');
        if (isLink)
            modifiers.push('GitHub link');
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_LINK_ACTION) {
            return toggleMetadataFlag(item, LINK_KEY);
        }
        return handleToggleNoGitAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        void settings;
        const hideNoGit = isHideNoGitEnabled(item);
        const isLink = isMetadataFlagEnabled(item, LINK_KEY);

        if (context.isPreview) {
            const text = item.rawValue ? 'main' : '⎇ main';
            return isLink ? renderOsc8Link('https://github.com/owner/repo/tree/main', text) : text;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '⎇ no git';
        }

        const branch = this.getGitBranch(context);
        if (!branch) {
            return hideNoGit ? null : '⎇ no git';
        }

        const displayText = item.rawValue ? branch : `⎇ ${branch}`;

        if (isLink) {
            const remoteUrl = runGit('remote get-url origin', context);
            const baseUrl = remoteUrl ? parseGitHubBaseUrl(remoteUrl) : null;
            if (baseUrl) {
                return renderOsc8Link(`${baseUrl}/tree/${encodeGitRefForUrlPath(branch)}`, displayText);
            }
        }

        return displayText;
    }

    private getGitBranch(context: RenderContext): string | null {
        return runGit('branch --show-current', context);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            ...getHideNoGitKeybinds(),
            { key: 'l', label: '(l)ink to GitHub', action: TOGGLE_LINK_ACTION }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}