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

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import {
    getUsageDirectionKeybind,
    getUsageDisplayModifierText,
    isUsageInverted,
    toggleUsageInverted
} from './shared/usage-display';

const LABEL = '→';
// On pace for the limit, so the preview reads with Block Limit Timer's
const PREVIEW_PROJECTED_PERCENT = 100;

export class BlockForecastWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return 'Projected usage of the 5-hour block at its reset, from the recent pace; hidden until there\'s a forecast'; }
    getDisplayName(): string { return 'Block Forecast'; }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: getUsageDisplayModifierText(item, { showUsageDirection: true })
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return action === 'toggle-invert' ? toggleUsageInverted(item) : null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('percent', item, settings);
        const inverted = isUsageInverted(item);
        const shown = (usedPercent: number): string => formatPercent(inverted ? 100 - usedPercent : usedPercent, format);

        if (context.isPreview) {
            return formatRawOrLabeledValue(item, LABEL, shown(PREVIEW_PROJECTED_PERCENT));
        }

        const forecast = context.sessionForecast;
        const currentPercent = context.usageData?.sessionUsage;
        if (!forecast || currentPercent === undefined) {
            return null;
        }

        // Nothing to add when the projection would only repeat the current value.
        const projected = shown(forecast.projectedPercent);
        if (projected === shown(Math.max(0, Math.min(100, currentPercent)))) {
            return null;
        }

        return formatRawOrLabeledValue(item, LABEL, projected);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return [getUsageDirectionKeybind(item)];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
