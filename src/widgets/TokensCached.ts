import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import { DEFAULT_SETTINGS } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/renderer';
import { parseTokenCount } from '../utils/value-parsers';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class TokensCachedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows cached token count for the current session'; }
    getDisplayName(): string { return 'Tokens Cached'; }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Cached: ', '12k');
        }

        if (context.tokenMetrics) {
            return formatRawOrLabeledValue(item, 'Cached: ', formatTokens(context.tokenMetrics.cachedTokens));
        }
        return null;
    }

    getValueType(): 'number' {
        return 'number';
    }

    getValue(context: RenderContext, item: WidgetItem): number | null {
        const rendered = this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS);
        if (!rendered) return null;
        return parseTokenCount(rendered);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}