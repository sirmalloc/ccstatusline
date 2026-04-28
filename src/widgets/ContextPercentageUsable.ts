import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowMetrics } from '../utils/context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from '../utils/model-context';

import {
    getContextInverseModifierText,
    handleContextInverseAction,
    isContextInverse
} from './shared/context-inverse';
import {
    cycleContextSliderMode,
    getContextSliderKeybinds,
    getContextSliderMode,
    getContextSliderModifierText,
    renderContextSlider
} from './shared/context-slider';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class ContextPercentageUsableWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows percentage of usable context window used or remaining (80% of max before auto-compact)'; }
    getDisplayName(): string { return 'Context % (usable)'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers = [
            getContextInverseModifierText(item),
            getContextSliderModifierText(item)
        ].filter((m): m is string => m !== undefined);
        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.map(m => m.replace(/^\(|\)$/g, '')).join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-slider') {
            return cycleContextSliderMode(item);
        }
        return handleContextInverseAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const isInverse = isContextInverse(item);
        const label = isInverse ? 'Ctx(u) Left: ' : 'Ctx(u) Used: ';
        const sliderMode = getContextSliderMode(item);
        const modelIdentifier = getModelContextIdentifier(context.data?.model);
        const contextWindowMetrics = getContextWindowMetrics(context.data);
        const contextConfig = getContextConfig(modelIdentifier, contextWindowMetrics.windowSize);

        const formatContextPercentage = (displayPercentage: number): string => {
            const sliderResult = renderContextSlider(sliderMode, displayPercentage);
            return formatRawOrLabeledValue(item, label, sliderResult ?? `${displayPercentage.toFixed(1)}%`);
        };

        if (context.isPreview) {
            return formatContextPercentage(isInverse ? 88.4 : 11.6);
        }

        if (contextWindowMetrics.contextLengthTokens !== null) {
            const usedPercentage = Math.min(100, (contextWindowMetrics.contextLengthTokens / contextConfig.usableTokens) * 100);
            const displayPercentage = isInverse ? (100 - usedPercentage) : usedPercentage;
            return formatContextPercentage(displayPercentage);
        }

        if (context.tokenMetrics) {
            const usedPercentage = Math.min(100, (context.tokenMetrics.contextLength / contextConfig.usableTokens) * 100);
            const displayPercentage = isInverse ? (100 - usedPercentage) : usedPercentage;
            return formatContextPercentage(displayPercentage);
        }
        return null;
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [
            { key: 'u', label: '(u)sed/remaining', action: 'toggle-inverse' },
            ...getContextSliderKeybinds()
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
