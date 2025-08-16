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
    ['tokens-input', new widgets.TokensInputWidget()],
    ['tokens-output', new widgets.TokensOutputWidget()],
    ['tokens-cached', new widgets.TokensCachedWidget()],
    ['tokens-total', new widgets.TokensTotalWidget()],
    ['context-length', new widgets.ContextLengthWidget()],
    ['context-percentage', new widgets.ContextPercentageWidget()],
    ['context-percentage-usable', new widgets.ContextPercentageUsableWidget()],
    ['session-clock', new widgets.SessionClockWidget()],
    ['terminal-width', new widgets.TerminalWidthWidget()],
    ['version', new widgets.VersionWidget()],
    ['custom-text', new widgets.CustomTextWidget()],
    ['custom-command', new widgets.CustomCommandWidget()]
]);

export function getWidget(type: WidgetItemType): Widget {
    const widget = widgetRegistry.get(type);
    if (!widget) {
        throw new Error(`Unknown widget type: ${type}`);
    }
    return widget;
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

export function isWidgetType(type: string): boolean {
    return widgetRegistry.has(type)
        || type === 'separator'
        || type === 'flex-separator';
}