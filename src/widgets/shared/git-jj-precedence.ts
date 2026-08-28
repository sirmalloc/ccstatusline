import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import { isInsideJjRepo } from '../../utils/jj';

// Only widgets with a direct 1:1 Jj counterpart are listed here — not every
// Git widget has one (e.g. git-pr, git-conflicts, git-staged have no jj
// equivalent). Where a Git widget could plausibly map to more than one Jj
// widget, the pairing follows what each one actually displays rather than
// grouping by feature area:
//   - git-branch <-> jj-bookmarks: both show a named ref.
//   - git-sha <-> jj-revision: both show a short commit/change identifier,
//     not a name, so git-sha pairs with jj-revision rather than jj-bookmarks.
//   - git-status <-> jj-changes: jj has no staged/unstaged distinction (the
//     working copy is always fully tracked), so there's no 1:1 status
//     widget; jj-changes is the closest signal for "there's local work here".
const GIT_TO_JJ_ANALOGS: Record<string, string[]> = {
    'git-branch': ['jj-bookmarks'],
    'git-sha': ['jj-revision'],
    'git-changes': ['jj-changes'],
    'git-insertions': ['jj-insertions'],
    'git-deletions': ['jj-deletions'],
    'git-root-dir': ['jj-root-dir'],
    'git-worktree': ['jj-workspace'],
    'git-status': ['jj-changes']
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
