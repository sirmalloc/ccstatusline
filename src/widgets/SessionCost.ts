import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';

export class SessionCostWidget implements Widget {
    getDefaultColor(): string {
        return 'green';
    }
    getDescription(): string {
        return 'Shows the total session cost in USD';
    }
    getDisplayName(): string {
        return 'Session Cost';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
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

    supportsRawValue(): boolean {
        return true;
    }
    supportsColors(): boolean {
        return true;
    }
}
