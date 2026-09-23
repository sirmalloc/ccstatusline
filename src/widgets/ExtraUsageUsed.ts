import type {
    RenderContext,
    RenderUsageData
} from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    WidgetItem
} from '../types/Widget';

import { ExtraUsageAmountWidget } from './shared/extra-usage-amount-widget';
import { isHidden } from './shared/hideable';
import { USAGE_ZERO_HIDEABLE_STATE } from './shared/usage-display';

export class ExtraUsageUsedWidget extends ExtraUsageAmountWidget {
    protected readonly label = 'Overage Used: ';
    protected readonly previewDollars = 106;

    getDescription(): string { return 'Shows extra usage spent: overage beyond Pro/Max plan limits, or your spend on Enterprise'; }
    getDisplayName(): string { return 'Extra Usage Used'; }

    override getHideableStates(): HideableState[] {
        return [...super.getHideableStates(), USAGE_ZERO_HIDEABLE_STATE];
    }

    override render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const data = context.usageData;
        if (!context.isPreview && data?.extraUsageEnabled === true && data.extraUsageUsed === 0 && isHidden(item, USAGE_ZERO_HIDEABLE_STATE.key)) {
            return null;
        }
        return super.render(item, context, settings);
    }

    protected getDollars(data: RenderUsageData): number | null {
        // extraUsageUsed is in cents
        return data.extraUsageUsed === undefined ? null : data.extraUsageUsed / 100;
    }
}
