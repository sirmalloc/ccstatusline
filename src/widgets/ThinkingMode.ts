import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class ThinkingModeWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows whether extended thinking is enabled or disabled'; }
    getDisplayName(): string { return 'Thinking Mode'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'Enabled' : 'Thinking: Enabled';
        } else if (context.data?.thinking?.enabled !== undefined) {
            const status = context.data.thinking.enabled ? 'Enabled' : 'Disabled';
            return item.rawValue ? status : `Thinking: ${status}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}