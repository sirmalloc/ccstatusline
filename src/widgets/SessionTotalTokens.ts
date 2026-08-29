import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/renderer';
import { SUBAGENTS_MARKER } from '../utils/token-subagents';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const BREAKDOWN_METADATA_KEY = 'breakdown';

function isBreakdownEnabled(item: WidgetItem): boolean {
    return item.metadata?.[BREAKDOWN_METADATA_KEY] === 'true';
}

export class SessionTotalTokensWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows total session tokens (input + output + cache) including sub-agents'; }
    getDisplayName(): string { return 'Session Total Tokens'; }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return isBreakdownEnabled(item)
            ? { displayText: this.getDisplayName(), modifierText: '[breakdown]' }
            : { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            const preview = formatRawOrLabeledValue(item, `${SUBAGENTS_MARKER}Total: `, '152k');
            return isBreakdownEnabled(item) && !item.rawValue
                ? `${preview} (in 90k/out 40k/cache 22k)`
                : preview;
        }

        const metrics = context.sessionTokenMetrics;
        if (!metrics) {
            return null;
        }

        const base = formatRawOrLabeledValue(item, `${SUBAGENTS_MARKER}Total: `, formatTokens(metrics.totalTokens));
        if (isBreakdownEnabled(item) && !item.rawValue) {
            return `${base} (in ${formatTokens(metrics.inputTokens)}/out ${formatTokens(metrics.outputTokens)}/cache ${formatTokens(metrics.cachedTokens)})`;
        }
        return base;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{ key: 'b', label: '(b)reakdown', action: 'toggle-breakdown' }];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action !== 'toggle-breakdown') {
            return null;
        }

        if (isBreakdownEnabled(item)) {
            const { [BREAKDOWN_METADATA_KEY]: _removed, ...restMetadata } = item.metadata ?? {};
            void _removed;
            return {
                ...item,
                metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
            };
        }

        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                [BREAKDOWN_METADATA_KEY]: 'true'
            }
        };
    }

    getNumericValue(context: RenderContext): number | null {
        return context.sessionTokenMetrics?.totalTokens ?? null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
