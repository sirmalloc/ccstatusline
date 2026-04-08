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
    getUpstreamRemoteInfo
} from '../utils/git-remote';
import { renderOsc8Link } from '../utils/hyperlink';

import {
    getRemoteWidgetKeybinds,
    getRemoteWidgetModifierText,
    handleRemoteWidgetAction,
    isHideNoRemoteEnabled,
    isLinkToRepoEnabled
} from './shared/git-remote';

export class GitUpstreamRepoWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the upstream remote repository name'; }
    getDisplayName(): string { return 'Git Upstream Repo'; }
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
            const text = 'upstream-repo';
            return linkEnabled ? renderOsc8Link('https://github.com/upstream-owner/upstream-repo', text) : text;
        }

        const upstream = getUpstreamRemoteInfo(context);
        if (!upstream) {
            return hideWhenEmpty ? null : 'no upstream';
        }

        const text = upstream.repo;

        if (linkEnabled) {
            const url = buildRepoWebUrl(upstream);
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