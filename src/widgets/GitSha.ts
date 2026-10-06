import type { RenderContext } from '../types/RenderContext';
import type { WidgetItem } from '../types/Widget';
import { getGitShortSha } from '../utils/git';

import { GitStatusWidgetBase } from './shared/git-status-widget';
import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';

export class GitShaWidget extends GitStatusWidgetBase {
    getDefaultColor(): string { return 'gray'; }
    getDescription(): string { return 'Shows short commit hash (SHA)'; }
    getDisplayName(): string { return 'Git SHA'; }

    protected renderPreview(): string {
        return 'a1b2c3d';
    }

    protected renderInWorkTree(item: WidgetItem, context: RenderContext): string | null {
        const sha = getGitShortSha(context);
        return sha ?? (isHidden(item, NO_GIT_HIDEABLE_STATE.key) ? null : '(no commit)');
    }

    supportsRawValue(): boolean { return false; }
}
