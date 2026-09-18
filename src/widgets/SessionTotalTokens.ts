import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { resolveNumberFormat } from '../utils/number-format';
import { formatTokens } from '../utils/renderer';
import { SUBAGENTS_MARKER } from '../utils/token-subagents';

import { isHidden } from './shared/hideable';
import {
    isMetadataFlagEnabled,
    removeMetadataKeys
} from './shared/metadata';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const BREAKDOWN_METADATA_KEY = 'breakdown';
const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when token count is zero' };

function isBreakdownEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, BREAKDOWN_METADATA_KEY);
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

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        const label = `${SUBAGENTS_MARKER}Total: `;
        if (context.isPreview) {
            const preview = formatRawOrLabeledValue(item, label, formatTokens(152000, format));
            return isBreakdownEnabled(item) && !item.rawValue
                ? `${preview} (in ${formatTokens(90000, format)}/out ${formatTokens(40000, format)}/cache ${formatTokens(22000, format)})`
                : preview;
        }

        const metrics = context.sessionTokenMetrics;
        if (!metrics) {
            return null;
        }

        if (metrics.totalTokens === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        const base = formatRawOrLabeledValue(item, label, formatTokens(metrics.totalTokens, format));
        if (isBreakdownEnabled(item) && !item.rawValue) {
            return `${base} (in ${formatTokens(metrics.inputTokens, format)}/out ${formatTokens(metrics.outputTokens, format)}/cache ${formatTokens(metrics.cachedTokens, format)})`;
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
            return removeMetadataKeys(item, [BREAKDOWN_METADATA_KEY]);
        }

        return {
            ...item,
            metadata: {
                ...item.metadata,
                [BREAKDOWN_METADATA_KEY]: 'true'
            }
        };
    }

    getNumericValue(context: RenderContext): number | null {
        return context.sessionTokenMetrics?.totalTokens ?? null;
    }

    supportsRawValue(): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
