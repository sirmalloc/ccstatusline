import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getUsageErrorMessage } from '../utils/usage';

import { makeTimerProgressBar } from './shared/progress-bar';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    cycleUsageDisplayMode,
    getUsageDisplayMode,
    getUsageDisplayModifierText,
    getUsagePercentCustomKeybinds,
    getUsageProgressBarWidth,
    isUsageInverted,
    isUsageProgressMode,
    isUsageSliderMode,
    makeSliderBar,
    toggleUsageInverted
} from './shared/usage-display';

export class ExtraUsageUtilizationWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows extra usage (pay-as-you-go) utilization percentage'; }
    getDisplayName(): string { return 'Extra Usage Utilization'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-progress') {
            return cycleUsageDisplayMode(item, [], true);
        }

        if (action === 'toggle-invert') {
            return toggleUsageInverted(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getUsageDisplayMode(item);
        const inverted = isUsageInverted(item);

        if (context.isPreview) {
            const previewPercent = 2.6;
            const renderedPercent = inverted ? 100 - previewPercent : previewPercent;

            if (isUsageProgressMode(displayMode)) {
                const width = getUsageProgressBarWidth(displayMode);
                const progressBar = makeTimerProgressBar(renderedPercent, width);
                return formatRawOrLabeledValue(item, 'Overage: ', `[${progressBar}] ${renderedPercent.toFixed(1)}%`);
            }

            if (isUsageSliderMode(displayMode)) {
                const slider = makeSliderBar(renderedPercent);
                const sliderDisplay = displayMode === 'slider' ? `${slider} ${renderedPercent.toFixed(1)}%` : slider;
                return formatRawOrLabeledValue(item, 'Overage: ', sliderDisplay);
            }

            return formatRawOrLabeledValue(item, 'Overage: ', `${previewPercent.toFixed(1)}%`);
        }

        const data = context.usageData ?? {};
        if (data.error)
            return getUsageErrorMessage(data.error);
        if (!data.extraUsageEnabled || data.extraUsageUtilization === undefined)
            return null;

        const percent = Math.max(0, Math.min(100, data.extraUsageUtilization * 100));
        const renderedPercent = inverted ? 100 - percent : percent;

        if (isUsageProgressMode(displayMode)) {
            const width = getUsageProgressBarWidth(displayMode);
            const progressBar = makeTimerProgressBar(renderedPercent, width);
            return formatRawOrLabeledValue(item, 'Overage: ', `[${progressBar}] ${renderedPercent.toFixed(1)}%`);
        }

        if (isUsageSliderMode(displayMode)) {
            const slider = makeSliderBar(renderedPercent);
            const sliderDisplay = displayMode === 'slider' ? `${slider} ${renderedPercent.toFixed(1)}%` : slider;
            return formatRawOrLabeledValue(item, 'Overage: ', sliderDisplay);
        }

        return formatRawOrLabeledValue(item, 'Overage: ', `${percent.toFixed(1)}%`);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
