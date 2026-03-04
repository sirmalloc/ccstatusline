import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    calculateInputSpeed,
    formatSpeed
} from '../utils/speed-metrics';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class InputSpeedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows input token processing speed (tokens/sec)'; }
    getDisplayName(): string { return 'Input Speed'; }
    getCategory(): string { return 'Token Speed'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'In: ', '85.2 t/s');
        }

        if (context.speedMetrics) {
            const speed = calculateInputSpeed(context.speedMetrics);
            const formatted = formatSpeed(speed);
            return formatRawOrLabeledValue(item, 'In: ', formatted);
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}