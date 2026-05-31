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
    resolveGitCwd
} from '../utils/git';
import { getRemoteInfo } from '../utils/git-remote';
import type { GitReviewData } from '../utils/git-review-cache';
import {
    fetchGitReviewData,
    getGitReviewStatusLabel,
    truncateTitle
} from '../utils/git-review-cache';
import { renderOsc8Link } from '../utils/hyperlink';

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

const HIDE_STATUS_KEY = 'hideStatus';
const HIDE_TITLE_KEY = 'hideTitle';
const TOGGLE_STATUS_ACTION = 'toggle-status';
const TOGGLE_TITLE_ACTION = 'toggle-title';

export interface GitPrWidgetDeps {
    fetchGitReviewData: typeof fetchGitReviewData;
    getProcessCwd: typeof process.cwd;
    getRemoteInfo: typeof getRemoteInfo;
    isInsideGitWorkTree: typeof isInsideGitWorkTree;
    resolveGitCwd: typeof resolveGitCwd;
}

const DEFAULT_GIT_PR_WIDGET_DEPS: GitPrWidgetDeps = {
    fetchGitReviewData,
    getProcessCwd: () => process.cwd(),
    getRemoteInfo,
    isInsideGitWorkTree,
    resolveGitCwd
};

const PREVIEW_PR: GitReviewData = {
    number: 42,
    url: 'https://github.com/owner/repo/pull/42',
    title: 'Example PR title',
    state: 'OPEN',
    reviewDecision: ''
};

function resolvePrNoun(
    pr: GitReviewData | null,
    context: RenderContext,
    deps: GitPrWidgetDeps
): 'PR' | 'MR' {
    if (pr?.provider === 'glab')
        return 'MR';
    if (pr?.provider === 'gh')
        return 'PR';
    if (pr) {
        const url = pr.url.toLowerCase();
        if (url.includes('/-/merge_requests/') || url.includes('gitlab'))
            return 'MR';
    } else {
        const origin = deps.getRemoteInfo('origin', context);
        if (origin?.host.toLowerCase().includes('gitlab'))
            return 'MR';
    }
    return 'PR';
}

function buildDisplay(
    item: WidgetItem,
    pr: GitReviewData,
    showStatus: boolean,
    showTitle: boolean,
    noun: 'PR' | 'MR'
): string {
    const linkText = item.rawValue ? `#${pr.number}` : `${noun} #${pr.number}`;
    const parts: string[] = [renderOsc8Link(pr.url, linkText)];

    if (showStatus) {
        const status = getGitReviewStatusLabel(pr.state, pr.reviewDecision);
        if (status.length > 0) {
            parts.push(status);
        }
    }

    if (showTitle && pr.title.length > 0) {
        parts.push(truncateTitle(pr.title));
    }

    return parts.join(' ');
}

export class GitPrWidget implements Widget {
    constructor(private readonly deps: GitPrWidgetDeps = DEFAULT_GIT_PR_WIDGET_DEPS) {}

    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows PR/MR info for the current branch (clickable link, status, title)'; }
    getDisplayName(): string { return 'Git PR/MR'; }
    getCategory(): string { return 'Git'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [];
        const noGitText = getHideNoGitModifierText(item);
        if (noGitText)
            modifiers.push('hide \'no git\'');
        if (isMetadataFlagEnabled(item, HIDE_STATUS_KEY))
            modifiers.push('no status');
        if (isMetadataFlagEnabled(item, HIDE_TITLE_KEY))
            modifiers.push('no title');
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_STATUS_ACTION) {
            return toggleMetadataFlag(item, HIDE_STATUS_KEY);
        }
        if (action === TOGGLE_TITLE_ACTION) {
            return toggleMetadataFlag(item, HIDE_TITLE_KEY);
        }
        return handleToggleNoGitAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        void settings;
        const hideNoGit = isHideNoGitEnabled(item);
        const showStatus = !isMetadataFlagEnabled(item, HIDE_STATUS_KEY);
        const showTitle = !isMetadataFlagEnabled(item, HIDE_TITLE_KEY);

        if (context.isPreview) {
            return buildDisplay(item, PREVIEW_PR, showStatus, showTitle, resolvePrNoun(PREVIEW_PR, context, this.deps));
        }

        if (!this.deps.isInsideGitWorkTree(context)) {
            return hideNoGit ? null : `(no ${resolvePrNoun(null, context, this.deps)})`;
        }

        const cwd = this.deps.resolveGitCwd(context) ?? this.deps.getProcessCwd();
        const prData = this.deps.fetchGitReviewData(cwd);
        if (!prData) {
            return hideNoGit ? null : `(no ${resolvePrNoun(null, context, this.deps)})`;
        }

        return buildDisplay(item, prData, showStatus, showTitle, resolvePrNoun(prData, context, this.deps));
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            ...getHideNoGitKeybinds(),
            { key: 's', label: '(s)tatus', action: TOGGLE_STATUS_ACTION },
            { key: 't', label: '(t)itle', action: TOGGLE_TITLE_ACTION }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
