import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import { isInsideJjRepo } from '../../utils/jj';

const GIT_TO_JJ_ANALOGS: Record<string, string[]> = {
    'git-branch': ['jj-bookmarks'],
    'git-sha': ['jj-revision'],
    'git-changes': ['jj-changes'],
    'git-insertions': ['jj-insertions'],
    'git-deletions': ['jj-deletions'],
    'git-root-dir': ['jj-root-dir'],
    'git-worktree': ['jj-workspace']
};

// A Git widget defers to its Jj counterpart once both are true: the repo is
// actually a jj repo (colocated .git repos otherwise still look like plain
// git repos to isInsideGitWorkTree), and the user has that Jj widget
// configured somewhere in their status line, meaning they're relying on it.
export function shouldHideGitWidgetForJj(
    gitType: string,
    context: RenderContext,
    settings: Settings
): boolean {
    const jjTypes = GIT_TO_JJ_ANALOGS[gitType];
    if (!jjTypes)
        return false;

    const jjAnalogConfigured = settings.lines.some(line => line.some(item => jjTypes.includes(item.type)));
    if (!jjAnalogConfigured)
        return false;

    return isInsideJjRepo(context);
}
