import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    calculateTotalSpeed,
    formatSpeed
} from '../utils/speed-metrics';

export class TotalSpeedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows total token processing speed (tokens/sec)'; }
    getDisplayName(): string { return 'Total Speed'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '127.7 t/s' : 'Total: 127.7 t/s';
        } else if (context.speedMetrics) {
            const speed = calculateTotalSpeed(context.speedMetrics);
            const formatted = formatSpeed(speed);
            return item.rawValue ? formatted : `Total: ${formatted}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}