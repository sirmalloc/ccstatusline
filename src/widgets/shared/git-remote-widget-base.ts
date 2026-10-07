import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import {
    buildRepoWebUrl,
    getRemoteInfo,
    getUpstreamRemoteInfo,
    type RemoteInfo
} from '../../utils/git-remote';
import { renderOsc8Link } from '../../utils/hyperlink';

import {
    getRemoteWidgetKeybinds,
    getRemoteWidgetModifierText,
    handleRemoteWidgetAction,
    isLinkToRepoEnabled
} from './git-remote';
import {
    NO_REMOTE_HIDEABLE_STATE,
    NO_UPSTREAM_HIDEABLE_STATE,
    isHidden
} from './hideable';

// How each remote is found, and what shows when it's missing
const REMOTES = {
    origin: {
        find: (context: RenderContext) => getRemoteInfo('origin', context),
        hideableState: NO_REMOTE_HIDEABLE_STATE,
        placeholder: 'no remote'
    },
    upstream: {
        find: getUpstreamRemoteInfo,
        hideableState: NO_UPSTREAM_HIDEABLE_STATE,
        placeholder: 'no upstream'
    }
};

// The Git Origin and Git Upstream widgets show part of a remote's owner/repo,
// optionally linked to the repository. They differ in the remote they read,
// what they show of it, and their name, color and preview sample.
export abstract class GitRemoteWidgetBase implements Widget {
    abstract getDefaultColor(): string;
    abstract getDescription(): string;
    abstract getDisplayName(): string;

    protected abstract readonly remote: keyof typeof REMOTES;
    // The TUI preview's sample, and the repository its link points to
    protected abstract readonly previewText: string;
    protected abstract readonly previewUrl: string;
    // What the widget shows of the remote
    protected abstract formatRemote(remote: RemoteInfo, item: WidgetItem, context: RenderContext): string;

    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getRemoteWidgetModifierText(item)
        };
    }

    getHideableStates(): HideableState[] {
        return [REMOTES[this.remote].hideableState];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleRemoteWidgetAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const linkEnabled = isLinkToRepoEnabled(item);

        if (context.isPreview) {
            const text = this.getPreviewText(item);
            return linkEnabled ? renderOsc8Link(this.previewUrl, text) : text;
        }

        const { find, hideableState, placeholder } = REMOTES[this.remote];
        const remote = find(context);
        if (!remote) {
            return isHidden(item, hideableState.key) ? null : placeholder;
        }

        const text = this.formatRemote(remote, item, context);
        return linkEnabled ? renderOsc8Link(buildRepoWebUrl(remote), text) : text;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getRemoteWidgetKeybinds();
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(_item: WidgetItem): boolean { return true; }

    protected getPreviewText(_item: WidgetItem): string {
        return this.previewText;
    }
}
