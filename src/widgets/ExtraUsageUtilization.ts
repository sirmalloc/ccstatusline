import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';
import { getUsageErrorMessage } from '../utils/usage';

import {
    appendHideDisabledModifier,
    getHideExtraUsageDisabledKeybind,
    handleToggleExtraUsageDisabledAction,
    isHideExtraUsageDisabledEnabled
} from './shared/extra-usage-disabled';
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
            modifierText: appendHideDisabledModifier(getUsageDisplayModifierText(item), item)
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        const hideDisabledItem = handleToggleExtraUsageDisabledAction(action, item);
        if (hideDisabledItem) {
            return hideDisabledItem;
        }

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
        const format = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            const previewPercent = 2.6;
            const renderedPercent = inverted ? 100 - previewPercent : previewPercent;

            if (isUsageProgressMode(displayMode)) {
                const width = getUsageProgressBarWidth(displayMode);
                const progressBar = makeTimerProgressBar(renderedPercent, width);
                return formatRawOrLabeledValue(item, 'Overage: ', `[${progressBar}] ${formatPercent(renderedPercent, format)}`);
            }

            if (isUsageSliderMode(displayMode)) {
                const slider = makeSliderBar(renderedPercent);
                const sliderDisplay = displayMode === 'slider' ? `${slider} ${formatPercent(renderedPercent, format)}` : slider;
                return formatRawOrLabeledValue(item, 'Overage: ', sliderDisplay);
            }

            return formatRawOrLabeledValue(item, 'Overage: ', formatPercent(previewPercent, format));
        }

        const data = context.usageData ?? {};
        if (data.extraUsageEnabled === false) {
            return isHideExtraUsageDisabledEnabled(item)
                ? null
                : formatRawOrLabeledValue(item, 'Overage: ', 'n/a');
        }
        if (data.extraUsageEnabled !== true || data.extraUsageUtilization === undefined) {
            if (data.error)
                return getUsageErrorMessage(data.error);
            return null;
        }

        // extraUsageUtilization is already a percentage (0-100), not a fraction
        const percent = Math.max(0, Math.min(100, data.extraUsageUtilization));
        const renderedPercent = inverted ? 100 - percent : percent;

        if (isUsageProgressMode(displayMode)) {
            const width = getUsageProgressBarWidth(displayMode);
            const progressBar = makeTimerProgressBar(renderedPercent, width);
            return formatRawOrLabeledValue(item, 'Overage: ', `[${progressBar}] ${formatPercent(renderedPercent, format)}`);
        }

        if (isUsageSliderMode(displayMode)) {
            const slider = makeSliderBar(renderedPercent);
            const sliderDisplay = displayMode === 'slider' ? `${slider} ${formatPercent(renderedPercent, format)}` : slider;
            return formatRawOrLabeledValue(item, 'Overage: ', sliderDisplay);
        }

        return formatRawOrLabeledValue(item, 'Overage: ', formatPercent(percent, format));
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [...getUsagePercentCustomKeybinds(item), getHideExtraUsageDisabledKeybind()];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
