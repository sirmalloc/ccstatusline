import type {
    RenderContext,
    RenderUsageData
} from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    WidgetItem
} from '../types/Widget';
import {
    rendersAsZero,
    resolveNumberFormat
} from '../utils/number-format';

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
        if (!context.isPreview && data?.extraUsageEnabled === true && isHidden(item, USAGE_ZERO_HIDEABLE_STATE.key)) {
            const dollars = this.getDollars(data);
            if (dollars !== null && rendersAsZero(dollars, resolveNumberFormat('cost', item, settings), 2)) {
                return null;
            }
        }
        return super.render(item, context, settings);
    }

    protected getDollars(data: RenderUsageData): number | null {
        // extraUsageUsed is in cents
        return data.extraUsageUsed === undefined ? null : data.extraUsageUsed / 100;
    }
}
