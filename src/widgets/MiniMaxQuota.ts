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
    private lastKnownQuota: string | null = null;

    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Shows MiniMax token quota (interval and weekly)'; }
    getDisplayName(): string { return 'MiniMax Quota'; }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        if (context.isPreview) {
            return formatRawOrLabeledValue(item, '', 'Model M  5H 3500/4500  W 40000/45000  |  Model IMG  D 45/50  W 300/350');
        }

        const quota = getMiniMaxQuota();

        // Build display text - show both MiniMax-M and image-01 if available
        const parts: string[] = [];

        // MiniMax-M quota (M2.7)
        if (quota && quota.intervalTotal > 0) {
            const intervalText = `${quota.intervalRemaining}/${quota.intervalTotal}`;
            const weeklyText = `${quota.weeklyRemaining}/${quota.weeklyTotal}`;
            parts.push(`Model M  5H ${intervalText}  W ${weeklyText}`);
        }

        // image-01 quota
        if (quota && quota.image01 && quota.image01.intervalTotal > 0) {
            const imgInterval = `${quota.image01.intervalRemaining}/${quota.image01.intervalTotal}`;
            const imgWeekly = `${quota.image01.weeklyRemaining}/${quota.image01.weeklyTotal}`;
            parts.push(`Model IMG  D ${imgInterval}  W ${imgWeekly}`);
        }

        if (parts.length > 0) {
            const displayText = parts.join('  |  ');
            this.lastKnownQuota = formatRawOrLabeledValue(item, '', displayText);
            return this.lastKnownQuota;
        }

        // Even if no fresh data, try to show last known (from file cache)
        if (this.lastKnownQuota) {
            return this.lastKnownQuota;
        }

        // First load - trigger async refresh and show placeholder
        if (!quota) {
            // Trigger async refresh in background
            import('../utils/minimax-quota').then(m => {
                m.fetchMiniMaxQuota().catch(() => {});
            });
        }

        return formatRawOrLabeledValue(item, '', 'Model M  5H --/--  W --/--  |  Model IMG  D --/--  W --/--');
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
