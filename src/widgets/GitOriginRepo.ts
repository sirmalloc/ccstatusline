import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    buildRepoWebUrl,
    getRemoteInfo
} from '../utils/git-remote';
import { renderOsc8Link } from '../utils/hyperlink';

import {
    getRemoteWidgetKeybinds,
    getRemoteWidgetModifierText,
    handleRemoteWidgetAction,
    isHideNoRemoteEnabled,
    isLinkToRepoEnabled
} from './shared/git-remote';

export class GitOriginRepoWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the origin remote repository name'; }
    getDisplayName(): string { return 'Git Origin Repo'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getRemoteWidgetModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleRemoteWidgetAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideWhenEmpty = isHideNoRemoteEnabled(item);
        const linkEnabled = isLinkToRepoEnabled(item);

        if (context.isPreview) {
            const text = 'repo';
            return linkEnabled ? renderOsc8Link('https://github.com/owner/repo', text) : text;
        }

        const origin = getRemoteInfo('origin', context);
        if (!origin) {
            return hideWhenEmpty ? null : 'no remote';
        }

        const text = origin.repo;

        if (linkEnabled) {
            const url = buildRepoWebUrl(origin);
            return renderOsc8Link(url, text);
        }

        return text;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getRemoteWidgetKeybinds();
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}