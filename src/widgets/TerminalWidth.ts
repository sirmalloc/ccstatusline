import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';
import { getTerminalWidth } from '../utils/terminal';

export class TerminalWidthWidget implements Widget {
    getDefaultColor(): string {
        return 'gray';
    }
    getDescription(): string {
        return 'Shows current terminal width in columns';
    }
    getDisplayName(): string {
        return 'Terminal Width';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        const width = context.terminalWidth ?? getTerminalWidth();
        if (context.isPreview) {
            const detectedWidth = width ?? '??';
            return item.rawValue ? `${detectedWidth}` : `Term: ${detectedWidth}`;
        } else if (width) {
            return item.rawValue ? `${width}` : `Term: ${width}`;
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
