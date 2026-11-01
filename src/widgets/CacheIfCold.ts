import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { formatTokens } from '../utils/format-tokens';
import { resolveNumberFormat } from '../utils/number-format';

import { getPromptCache } from './shared/prompt-cache';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

const LABEL = 'If cold: ';

// Claude Code leaves the figure null right after a compaction or a clearing of
// old tool results, until the next request records the conversation's new size
export class CacheIfColdWidget implements Widget {
    getDefaultColor(): string { return 'brightCyan'; }
    getDescription(): string { return 'Shows the tokens the next request re-caches if the prompt cache has gone cold by then'; }
    getDisplayName(): string { return 'Cache If Cold'; }
    getCategory(): string { return 'Cache'; }
    getLabelPrefix(): string { return LABEL; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const tokens = getPromptCache(context)?.recache_tokens_if_cold;
        if (typeof tokens !== 'number') {
            return null;
        }

        return formatRawOrLabeledValue(item, LABEL, formatTokens(tokens, resolveNumberFormat('token', item, settings)));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
