import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getTerminalWidth } from '../utils/terminal';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Term: ';

export class TerminalWidthWidget implements Widget {
    getDefaultColor(): string { return 'gray'; }
    getDescription(): string { return 'Shows current terminal width in columns'; }
    getDisplayName(): string { return 'Terminal Width'; }
    getCategory(): string { return 'Environment'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const width = context.terminalWidth ?? getTerminalWidth();
        if (context.isPreview) {
            const detectedWidth = width ?? '??';
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), `${detectedWidth}`);
        } else if (width) {
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), `${width}`);
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
