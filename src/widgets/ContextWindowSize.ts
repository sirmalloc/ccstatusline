import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowMetrics } from '../utils/context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from '../utils/model-context';
import { formatTokens } from '../utils/renderer';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class ContextWindowSizeWidget implements Widget {
    getDefaultColor(): string { return 'brightBlack'; }
    getDescription(): string { return 'Shows the total context window size (e.g. 200k, 1.0M)'; }
    getDisplayName(): string { return 'Context Window'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Win: ', '200.0k');
        }

        const metrics = getContextWindowMetrics(context.data);

        if (metrics.windowSize !== null) {
            return formatRawOrLabeledValue(item, 'Win: ', formatTokens(metrics.windowSize));
        }

        const modelIdentifier = getModelContextIdentifier(context.data?.model);
        const contextConfig = getContextConfig(modelIdentifier, null);
        return formatRawOrLabeledValue(item, 'Win: ', formatTokens(contextConfig.maxTokens));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}