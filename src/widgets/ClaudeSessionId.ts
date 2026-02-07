import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatWidgetLabel } from '../utils/nerd-font-icons';

export class ClaudeSessionIdWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the current Claude Code session ID reported in status JSON'; }
    getDisplayName(): string { return 'Claude Session ID'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatWidgetLabel('claude-session-id', 'preview-session-id', 'Session ID: ', item.rawValue, settings.nerdFontIcons);
        } else {
            const sessionId = context.data?.session_id;
            if (!sessionId) {
                return null;
            }
            return formatWidgetLabel('claude-session-id', sessionId, 'Session ID: ', item.rawValue, settings.nerdFontIcons);
        }
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}