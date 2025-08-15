import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../types/Widget';

export class ModelWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDisplayName(): string { return 'Model'; }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'Claude' : 'Model: Claude';
        } else if (context.data?.model) {
            return item.rawValue ? context.data.model.display_name : `Model: ${context.data.model.display_name}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
}