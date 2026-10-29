import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    getGitShortSha,
    isInsideGitWorkTree,
    runGit
} from '../utils/git';
import {
    buildBranchWebUrl,
    getRemoteInfo
} from '../utils/git-remote';
import {
    encodeGitRefForUrlPath,
    renderOsc8Link
} from '../utils/hyperlink';
import { isInsideJjRepo } from '../utils/jj';

import { makeModifierText } from './shared/editor-display';
import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';
import {
    MAX_WIDTH_ACTION,
    applyMaxWidth,
    getMaxWidthKeybind,
    getMaxWidthModifier,
    renderMaxWidthEditor
} from './shared/max-width';
import { isMetadataFlagEnabled } from './shared/metadata';
import {
    formatSymbolPrefix,
    getSymbolKeybind,
    renderSymbolOverrideEditor
} from './shared/symbol-override';

const DEFAULT_SYMBOL = '⎇';
const LINK_KEY = 'linkToRepo';
const LEGACY_LINK_KEY = 'linkToGitHub';
const TOGGLE_LINK_ACTION = 'toggle-link';
const BRANCH_REF_PREFIX = 'refs/heads/';

function isLinkEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, LINK_KEY)
        || (item.metadata?.[LINK_KEY] === undefined && isMetadataFlagEnabled(item, LEGACY_LINK_KEY));
}

function toggleLink(item: WidgetItem): WidgetItem {
    const nextEnabled = !isLinkEnabled(item);
    const {
        [LINK_KEY]: removedLink,
        [LEGACY_LINK_KEY]: removedLegacyLink,
        ...restMetadata
    } = item.metadata ?? {};

    const nextMetadata = nextEnabled
        ? { ...restMetadata, [LINK_KEY]: 'true' }
        : restMetadata;

    return {
        ...item,
        metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
    };
}

export class GitBranchWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current git branch name'; }
    getDisplayName(): string { return 'Git Branch'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const isLink = isLinkEnabled(item);
        const modifiers: string[] = [];
        if (isLink)
            modifiers.push('repo link');
        if (item.metadata?.fishStyle === 'true')
            modifiers.push('fish-style');
        const maxWidthText = getMaxWidthModifier(item);
        if (maxWidthText)
            modifiers.push(maxWidthText);
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_LINK_ACTION) {
            return toggleLink(item);
        }
        if (action === 'toggle-fish-style') {
            const enabled = item.metadata?.fishStyle === 'true';
            const { fishStyle, ...restMetadata } = item.metadata ?? {};
            const nextMetadata = enabled ? restMetadata : { ...restMetadata, fishStyle: 'true' };
            return {
                ...item,
                metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const hideNoGit = isHidden(item, NO_GIT_HIDEABLE_STATE.key);
        const isLink = isLinkEnabled(item);
        const fishStyle = item.metadata?.fishStyle === 'true';
        const prefix = formatSymbolPrefix(item, DEFAULT_SYMBOL);

        if (context.isPreview) {
            return this.renderPreview(item, prefix, isLink, fishStyle);
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : `${prefix}no git`;
        }

        // A detached HEAD (rebase, bisect, tag checkout) has no branch, so
        // show its commit in parentheses, as git prompts do. jj keeps git's
        // HEAD detached in a colocated repo, on a commit the user never
        // checked out, so there it's no branch at all.
        const branch = this.getGitBranch(context);
        const ref = branch ?? (this.isColocatedJjRepo(context) ? null : getGitShortSha(context));
        if (!ref) {
            return hideNoGit ? null : `${prefix}no git`;
        }

        // A detached HEAD renders as "(sha)" and must not be fish-abbreviated
        const value = branch ?? `(${ref})`;
        const displayValue = branch === null ? value : this.abbreviateBranch(value, fishStyle);
        const displayText = applyMaxWidth(item.rawValue ? displayValue : `${prefix}${displayValue}`, item.maxWidth);

        if (isLink) {
            const origin = getRemoteInfo('origin', context);
            if (origin) {
                return renderOsc8Link(
                    buildBranchWebUrl(origin, encodeGitRefForUrlPath(ref)),
                    displayText
                );
            }
        }

        return displayText;
    }

    private renderPreview(item: WidgetItem, prefix: string, isLink: boolean, fishStyle: boolean): string {
        // With a width limit, a sample long enough for the limit to show
        const sample = item.maxWidth ? 'feature/long-branch-name' : 'main';
        const display = this.abbreviateBranch(sample, fishStyle);
        const text = applyMaxWidth(item.rawValue ? display : `${prefix}${display}`, item.maxWidth);
        return isLink ? renderOsc8Link(`https://github.com/owner/repo/tree/${sample}`, text) : text;
    }

    private getGitBranch(context: RenderContext): string | null {
        // The full ref, since --short turns it into "heads/<name>" when a tag
        // has the same name
        const ref = runGit('symbolic-ref HEAD', context);
        return ref?.startsWith(BRANCH_REF_PREFIX) ? ref.slice(BRANCH_REF_PREFIX.length) : ref;
    }

    // Fish-style branch abbreviation: every segment but the last collapses to
    // its first character, so 'main' -> 'm' and 'fix/np/story' -> 'f/p/story'.
    private abbreviateBranch(branch: string, fishStyle: boolean): string {
        if (!fishStyle) {
            return branch;
        }
        const parts = branch.split('/');
        if (parts.length === 1) {
            return Array.from(branch)[0] ?? '';
        }
        return parts.map((part, index) => (index === parts.length - 1 ? part : Array.from(part)[0] ?? '')).join('/');
    }

    // jj finds its workspace from the nearest .jj above, past a git repo's own
    // root, so `jj root` also succeeds in a plain git repo anywhere under a jj
    // workspace. The repo is colocated only when its work tree holds the .jj.
    private isColocatedJjRepo(context: RenderContext): boolean {
        if (!isInsideJjRepo(context)) {
            return false;
        }

        const topLevel = runGit('rev-parse --show-toplevel', context);
        if (!topLevel) {
            return false;
        }

        try {
            return fs.statSync(path.join(topLevel, '.jj')).isDirectory();
        } catch {
            return false;
        }
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'l', label: '(l)ink to repo', action: TOGGLE_LINK_ACTION },
            { key: 'f', label: '(f)ish style', action: 'toggle-fish-style' },
            getMaxWidthKeybind(),
            getSymbolKeybind()
        ];
    }

    renderEditor(props: WidgetEditorProps) {
        if (props.action === MAX_WIDTH_ACTION) {
            return renderMaxWidthEditor(props);
        }
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
