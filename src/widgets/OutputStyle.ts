import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';

export class OutputStyleWidget implements Widget {
    getDefaultColor(): string {
        return 'cyan';
    }
    getDescription(): string {
        return 'Shows the current Claude Code output style';
    }
    getDisplayName(): string {
        return 'Output Style';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'default' : 'Style: default';
        } else if (context.data?.output_style?.name) {
            return item.rawValue ? context.data.output_style.name : `Style: ${context.data.output_style.name}`;
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
