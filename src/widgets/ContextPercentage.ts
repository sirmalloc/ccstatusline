import type { RenderContext } from '../types/RenderContext';
import { calculateContextPercentageMetrics } from '../utils/context-percentage';

import { ContextPercentageWidgetBase } from './shared/context-percentage-widget-base';

export class ContextPercentageWidget extends ContextPercentageWidgetBase {
    protected readonly labelPrefix = 'Ctx';
    protected readonly previewUsedPercent = 90;

    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows percentage of context window used or remaining'; }
    getDisplayName(): string { return 'Context %'; }

    protected getUsedPercentage(context: RenderContext): number | null {
        return calculateContextPercentageMetrics(context)?.usedPercentage ?? null;
    }
}
