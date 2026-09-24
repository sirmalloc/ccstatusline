import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Session ID: ';

export class ClaudeSessionIdWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows the current Claude Code session ID reported in status JSON'; }
    getDisplayName(): string { return 'Claude Session ID'; }
    getCategory(): string { return 'Core'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, LABEL, 'preview-session-id');
        } else {
            const sessionId = context.data?.session_id;
            if (!sessionId) {
                return null;
            }
            return formatRawOrLabeledValue(item, LABEL, sessionId);
        }
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
