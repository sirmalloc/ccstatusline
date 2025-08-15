import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetItem
} from '../types/Widget';

export class VersionWidget implements Widget {
    getDefaultColor(): string { return 'gray'; }
    getDisplayName(): string { return 'Version'; }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '1.0.0' : 'v1.0.0';
        } else if (context.data?.version) {
            return item.rawValue ? context.data.version : `v${context.data.version}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
}