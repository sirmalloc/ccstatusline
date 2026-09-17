import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    formatCost,
    resolveNumberFormat
} from '../utils/number-format';

import { getCostBreakdown } from './shared/cost-metrics';
import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when cost is $0.00' };

export class CostInputWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows the estimated input-token share of the session cost'; }
    getDisplayName(): string { return 'Cost Input'; }
    getCategory(): string { return 'Cost'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('cost', item, settings);
        if (context.isPreview) {
            const value = formatCost(0.18, format);
            return formatRawOrLabeledValue(item, 'In ', value);
        }

        const breakdown = getCostBreakdown(context);
        if (!breakdown) {
            return null;
        }

        const roundsToZeroCents = breakdown.inputCost >= 0 && breakdown.inputCost < 0.005;
        if (roundsToZeroCents && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatRawOrLabeledValue(item, 'In ', formatCost(breakdown.inputCost, format));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
