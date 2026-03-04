import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    calculateOutputSpeed,
    formatSpeed
} from '../utils/speed-metrics';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class OutputSpeedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows output token generation speed (tokens/sec)'; }
    getDisplayName(): string { return 'Output Speed'; }
    getCategory(): string { return 'Token Speed'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Out: ', '42.5 t/s');
        }

        if (context.speedMetrics) {
            const speed = calculateOutputSpeed(context.speedMetrics);
            const formatted = formatSpeed(speed);
            return formatRawOrLabeledValue(item, 'Out: ', formatted);
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}