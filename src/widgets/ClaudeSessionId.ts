import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { execSync } from 'child_process';

export class ClaudeSessionIdWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the most recently active Claude Code session ID'; }
    getDisplayName(): string { return 'Claude Session ID'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return 'cl-session-id-preview';
        } else {
            try {
                const sessionId = execSync('ls -td ~/.claude/session-env/*/ | head -1 | xargs basename', { encoding: 'utf8', stdio: 'pipe' }).trim();
                return sessionId || null;
            } catch (error) {
                console.error('Error getting Claude Session ID:', error);
                return 'Error';
            }
        }
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
