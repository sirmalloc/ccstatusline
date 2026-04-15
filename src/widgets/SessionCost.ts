import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import { DEFAULT_SETTINGS } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { parseCurrency } from '../utils/value-parsers';

export class SessionCostWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows the total session cost in USD'; }
    getDisplayName(): string { return 'Session Cost'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? '$2.45' : 'Cost: $2.45';
        }

        const totalCost = context.data?.cost?.total_cost_usd;
        if (totalCost === undefined) {
            return null;
        }

        // Format the cost to 2 decimal places
        const formattedCost = `$${totalCost.toFixed(2)}`;

        return item.rawValue ? formattedCost : `Cost: ${formattedCost}`;
    }

    getValueType(): 'number' {
        return 'number';
    }

    getValue(context: RenderContext, item: WidgetItem): number | null {
        const rendered = this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS);
        if (!rendered) return null;
        return parseCurrency(rendered);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}