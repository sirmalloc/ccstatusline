import type {
    Widget,
    WidgetItemType
} from '../types/Widget';
import * as widgets from '../widgets';

export interface WidgetManifestEntry {
    type: WidgetItemType;
    create: () => Widget;
}

export interface LayoutWidgetManifestEntry {
    type: WidgetItemType;
    displayName: string;
    description: string;
    category: string;
}

export const WIDGET_MANIFEST: WidgetManifestEntry[] = [
    { type: 'model', create: () => new widgets.ModelWidget() },
    { type: 'output-style', create: () => new widgets.OutputStyleWidget() },
    { type: 'git-branch', create: () => new widgets.GitBranchWidget() },
    { type: 'git-changes', create: () => new widgets.GitChangesWidget() },
    { type: 'git-insertions', create: () => new widgets.GitInsertionsWidget() },
    { type: 'git-deletions', create: () => new widgets.GitDeletionsWidget() },
    { type: 'git-root-dir', create: () => new widgets.GitRootDirWidget() },
    { type: 'git-worktree', create: () => new widgets.GitWorktreeWidget() },
    { type: 'jj-change', create: () => new widgets.JjChangeWidget() },
    { type: 'jj-bookmark', create: () => new widgets.JjBookmarkWidget() },
    { type: 'jj-changes', create: () => new widgets.JjChangesWidget() },
    { type: 'jj-insertions', create: () => new widgets.JjInsertionsWidget() },
    { type: 'jj-deletions', create: () => new widgets.JjDeletionsWidget() },
    { type: 'jj-root-dir', create: () => new widgets.JjRootDirWidget() },
    { type: 'jj-description', create: () => new widgets.JjDescriptionWidget() },
    { type: 'jj-workspace', create: () => new widgets.JjWorkspaceWidget() },
    { type: 'current-working-dir', create: () => new widgets.CurrentWorkingDirWidget() },
    { type: 'tokens-input', create: () => new widgets.TokensInputWidget() },
    { type: 'tokens-output', create: () => new widgets.TokensOutputWidget() },
    { type: 'tokens-cached', create: () => new widgets.TokensCachedWidget() },
    { type: 'tokens-total', create: () => new widgets.TokensTotalWidget() },
    { type: 'input-speed', create: () => new widgets.InputSpeedWidget() },
    { type: 'output-speed', create: () => new widgets.OutputSpeedWidget() },
    { type: 'total-speed', create: () => new widgets.TotalSpeedWidget() },
    { type: 'context-length', create: () => new widgets.ContextLengthWidget() },
    { type: 'context-percentage', create: () => new widgets.ContextPercentageWidget() },
    { type: 'context-percentage-usable', create: () => new widgets.ContextPercentageUsableWidget() },
    { type: 'session-clock', create: () => new widgets.SessionClockWidget() },
    { type: 'session-cost', create: () => new widgets.SessionCostWidget() },
    { type: 'block-timer', create: () => new widgets.BlockTimerWidget() },
    { type: 'terminal-width', create: () => new widgets.TerminalWidthWidget() },
    { type: 'version', create: () => new widgets.VersionWidget() },
    { type: 'custom-text', create: () => new widgets.CustomTextWidget() },
    { type: 'custom-command', create: () => new widgets.CustomCommandWidget() },
    { type: 'link', create: () => new widgets.LinkWidget() },
    { type: 'claude-session-id', create: () => new widgets.ClaudeSessionIdWidget() },
    { type: 'session-name', create: () => new widgets.SessionNameWidget() },
    { type: 'free-memory', create: () => new widgets.FreeMemoryWidget() },
    { type: 'session-usage', create: () => new widgets.SessionUsageWidget() },
    { type: 'weekly-usage', create: () => new widgets.WeeklyUsageWidget() },
    { type: 'reset-timer', create: () => new widgets.BlockResetTimerWidget() },
    { type: 'weekly-reset-timer', create: () => new widgets.WeeklyResetTimerWidget() },
    { type: 'context-bar', create: () => new widgets.ContextBarWidget() },
    { type: 'skills', create: () => new widgets.SkillsWidget() }
];

export const LAYOUT_WIDGET_MANIFEST: LayoutWidgetManifestEntry[] = [
    {
        type: 'separator',
        displayName: 'Separator',
        description: 'A separator character between status line widgets',
        category: 'Layout'
    },
    {
        type: 'flex-separator',
        displayName: 'Flex Separator',
        description: 'Expands to fill available terminal width',
        category: 'Layout'
    }
];