import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatWidgetLabel } from '../utils/nerd-font-icons';

export class VersionWidget implements Widget {
    getDefaultColor(): string { return 'gray'; }
    getDescription(): string { return 'Shows Claude Code CLI version number'; }
    getDisplayName(): string { return 'Version'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatWidgetLabel('version', '1.0.0', 'v', item.rawValue, settings.nerdFontIcons);
        } else if (context.data?.version) {
            return formatWidgetLabel('version', context.data.version, 'v', item.rawValue, settings.nerdFontIcons);
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}