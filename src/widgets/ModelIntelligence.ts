import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowMetrics } from '../utils/context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from '../utils/model-context';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

function getModelBeta(modelIdentifier?: string): number {
    if (!modelIdentifier) {
        return 1.5;
    }

    const lower = modelIdentifier.toLowerCase();

    if (lower.includes('opus')) {
        return 1.8;
    }

    if (lower.includes('haiku')) {
        return 1.2;
    }

    return 1.5;
}

function calculateMI(usageRatio: number, beta: number): number {
    const clamped = Math.max(0, Math.min(1, usageRatio));
    return Math.max(0, 1 - clamped ** beta);
}

function getUsageRatio(context: RenderContext): number | null {
    const metrics = getContextWindowMetrics(context.data);

    if (metrics.usedPercentage !== null) {
        return metrics.usedPercentage / 100;
    }

    if (context.tokenMetrics) {
        const modelIdentifier = getModelContextIdentifier(context.data?.model);
        const contextConfig = getContextConfig(modelIdentifier, metrics.windowSize);
        return Math.min(1, context.tokenMetrics.contextLength / contextConfig.maxTokens);
    }

    return null;
}

export class ModelIntelligenceWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Model Intelligence score based on context fill level'; }
    getDisplayName(): string { return 'Model Intelligence'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const modelIdentifier = getModelContextIdentifier(context.data?.model);
        const beta = getModelBeta(modelIdentifier);

        if (context.isPreview) {
            const previewMI = calculateMI(0.093, beta);
            return formatRawOrLabeledValue(item, 'MI: ', previewMI.toFixed(3));
        }

        const usageRatio = getUsageRatio(context);
        if (usageRatio === null) {
            return null;
        }

        const mi = calculateMI(usageRatio, beta);
        return formatRawOrLabeledValue(item, 'MI: ', mi.toFixed(3));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}