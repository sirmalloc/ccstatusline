import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../types/Widget';

export class SessionClockWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDisplayName(): string { return 'Session Clock'; }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '2hr 15m' : 'Session: 2hr 15m';
        } else if (context.sessionDuration) {
            return item.rawValue ? context.sessionDuration : `Session: ${context.sessionDuration}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
}