import type { RenderContext } from '../types/RenderContext';
import { DEFAULT_SETTINGS, type Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getTerminalWidth } from '../utils/terminal';
import { parseIntSafe } from '../utils/value-parsers';

export class TerminalWidthWidget implements Widget {
    getDefaultColor(): string { return 'gray'; }
    getDescription(): string { return 'Shows current terminal width in columns'; }
    getDisplayName(): string { return 'Terminal Width'; }
    getCategory(): string { return 'Environment'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const width = context.terminalWidth ?? getTerminalWidth();
        if (context.isPreview) {
            const detectedWidth = width ?? '??';
            return item.rawValue ? `${detectedWidth}` : `Term: ${detectedWidth}`;
        } else if (width) {
            return item.rawValue ? `${width}` : `Term: ${width}`;
        }
        return null;
    }

    getValueType(): 'number' {
        return 'number';
    }

    getValue(context: RenderContext, item: WidgetItem): number | null {
        const rendered = this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS);
        if (!rendered) return null;
        return parseIntSafe(rendered);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}