import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getLatestTipFile } from '../utils/tips';

export class VersionUpdateWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows version update notification from tip files'; }
    getDisplayName(): string { return 'Version Update'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(_item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'v1.0.0 \u2192 v2.0.0' : 'Updated: v1.0.0 \u2192 v2.0.0';
        }

        const tipFile = getLatestTipFile(settings);
        if (!tipFile) {
            return null;
        }

        const text = tipFile.previousVersion
            ? `v${tipFile.previousVersion} \u2192 v${tipFile.version}`
            : `v${tipFile.version}`;
        return item.rawValue ? text : `Updated: ${text}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
