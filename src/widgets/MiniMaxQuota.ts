import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getMiniMaxQuota } from '../utils/minimax-quota';

import { formatRawOrLabeledValue } from './shared/raw-or-labeled';

export class MiniMaxQuotaWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows MiniMax token quota (interval and weekly)'; }
    getDisplayName(): string { return 'MiniMax Quota'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, '', '⏎ 3500/4500  ◑ 40000/45000');
        }

        const quota = getMiniMaxQuota();
        if (!quota) {
            return null;
        }

        const intervalText = `${quota.intervalRemaining}/${quota.intervalTotal}`;
        const weeklyText = `${quota.weeklyRemaining}/${quota.weeklyTotal}`;

        const displayText = `⏎ ${intervalText}  ◑ ${weeklyText}`;
        return formatRawOrLabeledValue(item, '', displayText);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
