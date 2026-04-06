import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getDetailLevel } from '../utils/detail-level';

export class ModelWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Displays the Claude model name (e.g., Claude 3.5 Sonnet)'; }
    getDisplayName(): string { return 'Model'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'Claude' : 'Model: Claude';
        }

        const model = context.data?.model;
        const modelDisplayName = typeof model === 'string'
            ? model
            : (model?.display_name ?? model?.id);

        if (modelDisplayName) {
            const detail = getDetailLevel(context.terminalWidth);
            let name = modelDisplayName;

            if (detail === 'narrow') {
                name = modelDisplayName.split(' ')[0] ?? modelDisplayName;
            } else if (detail === 'medium') {
                name = modelDisplayName.replace(/\s*\([^)]*\)\s*$/, '');
            }

            return item.rawValue ? name : `Model: ${name}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}