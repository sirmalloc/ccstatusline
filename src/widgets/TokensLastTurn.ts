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

const ZERO_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when token count is zero' };

const DISPLAY_METADATA_KEY = 'display';
const TURN_DISPLAY_MODE = 'turn';

export class TokensLastTurnWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows token usage (input + output + cache) for the most recent assistant message only, deduplicated per API call. Set metadata display=turn to show the user turn number instead'; }
    getDisplayName(): string { return 'Tokens Last Turn'; }
    getCategory(): string { return 'Tokens'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: item.metadata?.[DISPLAY_METADATA_KEY] === TURN_DISPLAY_MODE ? 'Turn Number' : this.getDisplayName() };
    }

    getHideableStates(): HideableState[] {
        return [ZERO_HIDEABLE_STATE];
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const format = resolveNumberFormat('token', item, settings);
        const showTurnNumber = item.metadata?.[DISPLAY_METADATA_KEY] === TURN_DISPLAY_MODE;
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, 'Turn: ', showTurnNumber ? '12' : formatTokens(2900, format));
        }

        if (showTurnNumber) {
            const turnCount = context.tokenMetrics?.turnCount;
            if (!turnCount) {
                return null;
            }
            return formatRawOrLabeledValue(item, 'Turn: ', String(turnCount));
        }

        const lastTurnTokens = context.tokenMetrics?.lastTurnTokens;
        if (!lastTurnTokens) {
            return null;
        }

        if (lastTurnTokens.totalTokens === 0 && isHidden(item, ZERO_HIDEABLE_STATE.key)) {
            return null;
        }

        return formatRawOrLabeledValue(item, 'Turn: ', formatTokens(lastTurnTokens.totalTokens, format));
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
