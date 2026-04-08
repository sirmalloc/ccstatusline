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
import type { IdeLinkMode } from '../utils/hyperlink';
import {
    IDE_LINK_MODES,
    buildIdeFileUrl,
    renderOsc8Link
} from '../utils/hyperlink';

import { makeModifierText } from './shared/editor-display';
import {
    getHideNoGitKeybinds,
    getHideNoGitModifierText,
    handleToggleNoGitAction,
    isHideNoGitEnabled
} from './shared/git-no-git';
import { isMetadataFlagEnabled } from './shared/metadata';

const IDE_LINK_KEY = 'linkToIDE';
const LEGACY_CURSOR_LINK_KEY = 'linkToCursor';
const TOGGLE_LINK_ACTION = 'toggle-link';
const IDE_LINK_LABELS: Record<IdeLinkMode, string> = {
    vscode: 'link-vscode',
    cursor: 'link-cursor'
};

export class GitRootDirWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the git repository root directory name'; }
    getDisplayName(): string { return 'Git Root Dir'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const ideLinkMode = this.getIdeLinkMode(item);
        const modifiers: string[] = [];
        const noGitText = getHideNoGitModifierText(item);
        if (noGitText)
            modifiers.push('hide \'no git\'');
        if (ideLinkMode)
            modifiers.push(IDE_LINK_LABELS[ideLinkMode]);
        return {
            displayText: this.getDisplayName(),
            modifierText: makeModifierText(modifiers)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_LINK_ACTION) {
            return this.cycleIdeLinkMode(item);
        }
        return handleToggleNoGitAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHideNoGitEnabled(item);
        const ideLinkMode = this.getIdeLinkMode(item);

        if (context.isPreview) {
            const name = 'my-repo';
            return ideLinkMode ? renderOsc8Link(buildIdeFileUrl('/Users/example/my-repo', ideLinkMode), name) : name;
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : 'no git';
        }

        const rootDir = this.getGitRootDir(context);
        if (!rootDir) {
            return hideNoGit ? null : 'no git';
        }

        const name = this.getRootDirName(rootDir);

        if (ideLinkMode) {
            return renderOsc8Link(buildIdeFileUrl(rootDir, ideLinkMode), name);
        }

        return name;
    }

    private getGitRootDir(context: RenderContext): string | null {
        return runGit('rev-parse --show-toplevel', context);
    }

    private getRootDirName(rootDir: string): string {
        const trimmedRootDir = rootDir.replace(/[\\/]+$/, '');
        const normalizedRootDir = trimmedRootDir.length > 0 ? trimmedRootDir : rootDir;
        const parts = normalizedRootDir.split(/[\\/]/).filter(Boolean);
        const lastPart = parts[parts.length - 1];
        return lastPart && lastPart.length > 0 ? lastPart : normalizedRootDir;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            ...getHideNoGitKeybinds(),
            { key: 'l', label: '(l)ink to IDE', action: TOGGLE_LINK_ACTION }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }

    private getIdeLinkMode(item: WidgetItem): IdeLinkMode | null {
        const configuredMode = item.metadata?.[IDE_LINK_KEY];
        if (configuredMode && IDE_LINK_MODES.includes(configuredMode as IdeLinkMode)) {
            return configuredMode as IdeLinkMode;
        }

        if (isMetadataFlagEnabled(item, LEGACY_CURSOR_LINK_KEY)) {
            return 'cursor';
        }

        return null;
    }

    private cycleIdeLinkMode(item: WidgetItem): WidgetItem {
        const currentMode = this.getIdeLinkMode(item);
        const currentIndex = currentMode ? IDE_LINK_MODES.indexOf(currentMode) : -1;
        const nextMode = currentIndex === IDE_LINK_MODES.length - 1 ? null : (IDE_LINK_MODES[currentIndex + 1] ?? null);
        const {
            [IDE_LINK_KEY]: removedIdeLink,
            [LEGACY_CURSOR_LINK_KEY]: removedLegacyLink,
            ...restMetadata
        } = item.metadata ?? {};

        void removedIdeLink;
        void removedLegacyLink;

        return {
            ...item,
            metadata: nextMode ? {
                ...restMetadata,
                [IDE_LINK_KEY]: nextMode
            } : (Object.keys(restMetadata).length > 0 ? restMetadata : undefined)
        };
    }
}