import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItemType
} from '../types/Widget';
import * as widgets from '../widgets';

// Create widget registry
const widgetRegistry = new Map<WidgetItemType, Widget>([
    ['model', new widgets.ModelWidget()],
    ['output-style', new widgets.OutputStyleWidget()],
    ['git-branch', new widgets.GitBranchWidget()],
    ['git-changes', new widgets.GitChangesWidget()],
    ['git-worktree', new widgets.GitWorktreeWidget()],
    ['current-working-dir', new widgets.CurrentWorkingDirWidget()],
    ['tokens-input', new widgets.TokensInputWidget()],
    ['tokens-output', new widgets.TokensOutputWidget()],
    ['tokens-cached', new widgets.TokensCachedWidget()],
    ['tokens-total', new widgets.TokensTotalWidget()],
    ['context-length', new widgets.ContextLengthWidget()],
    ['context-percentage', new widgets.ContextPercentageWidget()],
    ['context-percentage-usable', new widgets.ContextPercentageUsableWidget()],
    ['session-clock', new widgets.SessionClockWidget()],
    ['session-cost', new widgets.SessionCostWidget()],
    ['block-timer', new widgets.BlockTimerWidget()],
    ['terminal-width', new widgets.TerminalWidthWidget()],
    ['version', new widgets.VersionWidget()],
    ['custom-text', new widgets.CustomTextWidget()],
    ['custom-command', new widgets.CustomCommandWidget()],
    ['claude-session-id', new widgets.ClaudeSessionIdWidget()]
]);

export function getWidget(type: WidgetItemType): Widget | null {
    return widgetRegistry.get(type) ?? null;
}

export function getAllWidgetTypes(settings: Settings): WidgetItemType[] {
    const allTypes = Array.from(widgetRegistry.keys());

    // Add separator types based on settings
    if (!settings.powerline.enabled) {
        if (!settings.defaultSeparator) {
            allTypes.push('separator');
        }
        allTypes.push('flex-separator');
    }

    return allTypes;
}

export function isKnownWidgetType(type: string): boolean {
    return widgetRegistry.has(type)
        || type === 'separator'
        || type === 'flex-separator';
}