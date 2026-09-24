import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { resolveNumberFormat } from '../utils/number-format';
import { formatTokens } from '../utils/renderer';

import { isHidden } from './shared/hideable';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'Total: ';

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when token count is zero' };

export class TokensTotalWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows total token count (input + output + cache) for the current session'; }
    getDisplayName(): string { return 'Tokens Total'; }
    getCategory(): string { return 'Tokens'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, LABEL, formatTokens(30600, format));
        }

        if (context.tokenMetrics) {
            if (context.tokenMetrics.totalTokens === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
                return null;
            }
            return formatRawOrLabeledValue(item, LABEL, formatTokens(context.tokenMetrics.totalTokens, format));
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
