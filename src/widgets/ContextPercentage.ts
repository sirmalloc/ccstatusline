import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { calculateContextPercentageMetrics } from '../utils/context-percentage';

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

export class ContextPercentageWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows percentage of context window used or remaining'; }
    getDisplayName(): string { return 'Context %'; }
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
        const sliderMode = getContextSliderMode(item);
        const contextPercentageMetrics = calculateContextPercentageMetrics(context);

        if (context.isPreview) {
            const previewPercent = isInverse ? 90.7 : 9.3;
            const sliderResult = renderContextSlider(sliderMode, previewPercent);
            if (sliderResult !== null) {
                return formatRawOrLabeledValue(item, 'Ctx: ', sliderResult);
            }
            return formatRawOrLabeledValue(item, 'Ctx: ', `${previewPercent.toFixed(1)}%`);
        }

        if (contextPercentageMetrics !== null) {
            const displayPercentage = isInverse ? (100 - contextPercentageMetrics.usedPercentage) : contextPercentageMetrics.usedPercentage;
            const sliderResult = renderContextSlider(sliderMode, displayPercentage);
            if (sliderResult !== null) {
                return formatRawOrLabeledValue(item, 'Ctx: ', sliderResult);
            }
            return formatRawOrLabeledValue(item, 'Ctx: ', `${displayPercentage.toFixed(1)}%`);
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
