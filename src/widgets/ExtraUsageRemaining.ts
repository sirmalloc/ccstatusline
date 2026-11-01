import type { RenderUsageData } from '../types/RenderContext';

import { ExtraUsageAmountWidget } from './shared/extra-usage-amount-widget';

export class ExtraUsageRemainingWidget extends ExtraUsageAmountWidget {
    protected readonly label = 'Overage Left: ';
    protected readonly previewDollars = 3894;

    getDescription(): string { return 'Shows what\'s left of your monthly extra usage limit (Pro/Max overage or Enterprise spend)'; }
    getDisplayName(): string { return 'Extra Usage Remaining'; }

    protected getDollars(data: RenderUsageData): number | null {
        if (data.extraUsageLimit === undefined || data.extraUsageUsed === undefined) {
            return null;
        }
        // Both extraUsageLimit and extraUsageUsed are in cents
        return Math.max(0, data.extraUsageLimit / 100 - data.extraUsageUsed / 100);
    }
}
