import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    isInsideGitWorkTree,
    resolveGitCwd
} from '../utils/git';
import type { GitCiChecks } from '../utils/git-review-cache';
import { getCachedGitReviewData } from '../utils/git-review-cache';

import {
    NO_GIT_HIDEABLE_STATE,
    isHidden
} from './shared/hideable';

const NO_CHECKS = '-';
const NO_DATA_HIDEABLE_STATE: HideableState = { key: 'no-data', label: 'when there is no check data' };
const SYMBOLS = {
    success: '✓',
    passing: '✓',
    failing: '✗',
    pending: '●'
} as const;

export interface GitCiStatusWidgetDeps {
    getCachedGitReviewData: typeof getCachedGitReviewData;
    getProcessCwd: typeof process.cwd;
    isInsideGitWorkTree: typeof isInsideGitWorkTree;
    resolveGitCwd: typeof resolveGitCwd;
}

const DEFAULT_DEPS: GitCiStatusWidgetDeps = {
    getCachedGitReviewData,
    getProcessCwd: () => process.cwd(),
    isInsideGitWorkTree,
    resolveGitCwd
};

const PREVIEW_CHECKS: GitCiChecks = {
    state: 'failing',
    failing: 1,
    pending: 1,
    success: 5
};

function buildDisplay(checks: GitCiChecks, rawValue: boolean): string {
    if (rawValue)
        return checks.state;

    const parts: string[] = [];
    if (checks.failing > 0)
        parts.push(`${SYMBOLS.failing}${checks.failing}`);
    if (checks.pending > 0)
        parts.push(`${SYMBOLS.pending}${checks.pending}`);
    if (checks.success > 0)
        parts.push(`${SYMBOLS.success}${checks.success}`);

    return parts.length > 0 ? parts.join(' ') : `${SYMBOLS[checks.state]}0`;
}

export class GitCiStatusWidget implements Widget {
    constructor(private readonly deps: GitCiStatusWidgetDeps = DEFAULT_DEPS) {}

    getDefaultColor(): string {
        return 'green';
    }

    getDescription(): string {
        return 'Shows CI check status for the current branch\'s PR (GitHub only)';
    }

    getDisplayName(): string {
        return 'Git CI Status';
    }

    getCategory(): string {
        return 'Git';
    }

    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [NO_GIT_HIDEABLE_STATE, NO_DATA_HIDEABLE_STATE];
    }

    render(
        item: WidgetItem,
        context: RenderContext,
        _settings: Settings
    ): string | null {
        const rawValue = item.rawValue ?? false;

        if (context.isPreview) {
            return buildDisplay(PREVIEW_CHECKS, rawValue);
        }

        if (!this.deps.isInsideGitWorkTree(context)) {
            return isHidden(item, NO_GIT_HIDEABLE_STATE.key) ? null : '(no git)';
        }

        const cwd = this.deps.resolveGitCwd(context) ?? this.deps.getProcessCwd();
        const checks = this.deps.getCachedGitReviewData(cwd, { includeChecks: true })?.checks;
        if (!checks) {
            return isHidden(item, NO_DATA_HIDEABLE_STATE.key) ? null : NO_CHECKS;
        }

        return buildDisplay(checks, rawValue);
    }

    supportsRawValue(): boolean {
        return true;
    }

    supportsColors(_item: WidgetItem): boolean {
        return true;
    }
}
