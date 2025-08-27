import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';

export class SessionClockWidget implements Widget {
    getDefaultColor(): string {
        return 'yellow';
    }
    getDescription(): string {
        return 'Shows elapsed time since current session started';
    }
    getDisplayName(): string {
        return 'Session Clock';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? '2hr 15m' : 'Session: 2hr 15m';
        } else if (context.sessionDuration) {
            return item.rawValue ? context.sessionDuration : `Session: ${context.sessionDuration}`;
        }
        return null;
    }

    supportsRawValue(): boolean {
        return true;
    }
    supportsColors(): boolean {
        return true;
    }
}
