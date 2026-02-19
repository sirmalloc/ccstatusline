import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class BlockUsageWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows current block cost vs estimated max cost'; }
    getDisplayName(): string { return 'Block Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '$14.50/~$89.20' : 'Block: $14.50/~$89.20';
        }

        const metrics = context.blockTokenMetrics;
        if (!metrics) {
            return null;
        }

        const current = `$${metrics.estimatedCostUsd.toFixed(2)}`;
        const max = metrics.estimatedMaxCostUsd > 0
            ? `~$${metrics.estimatedMaxCostUsd.toFixed(2)}`
            : '~?';
        const suffix = metrics.isMaxEstimated ? ' (insufficient data)' : '';
        const value = `${current}/${max}${suffix}`;

        return item.rawValue ? value : `Block: ${value}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}