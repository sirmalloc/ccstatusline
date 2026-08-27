import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

// Session cost including subagents. Claude Code's cost.total_cost_usd covers
// only the main transcript; this widget adds the cost of Task/Agent subagents
// (priced from their separate transcripts) so heavy parallel-agent sessions
// show a realistic total.
export class SessionCostTotalWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows the total session cost in USD including subagents (Task/Agent tool)'; }
    getDisplayName(): string { return 'Session Cost (with subagents)'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        void settings;
        if (context.isPreview) {
            return item.rawValue ? '$3.55' : 'Total Cost: $3.55';
        }

        const mainCost = context.data?.cost?.total_cost_usd;
        if (mainCost === undefined) {
            return null;
        }

        const total = mainCost + (context.subagentCostUsd ?? 0);
        const formatted = `$${total.toFixed(2)}`;

        return item.rawValue ? formatted : `Total Cost: ${formatted}`;
    }

    getNumericValue(context: RenderContext): number | null {
        const mainCost = context.data?.cost?.total_cost_usd;
        if (mainCost === undefined) {
            return null;
        }
        return mainCost + (context.subagentCostUsd ?? 0);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
