import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getGitChangeCounts,
    isInsideGitWorkTree
} from '../utils/git';

import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when there are no changes' };

export class GitChangesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows git changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'Git Changes'; }
    getCategory(): string { return 'Git'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE, ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = isHidden(item, NO_GIT_HIDEABLE_STATE.key);

        if (context.isPreview) {
            return '(+42,-10)';
        }

        if (!isInsideGitWorkTree(context)) {
            return hideNoGit ? null : '(no git)';
        }

        const changes = getGitChangeCounts(context);
        if (changes.insertions === 0 && changes.deletions === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return `(+${changes.insertions},-${changes.deletions})`;
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
