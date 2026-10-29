import type { RenderUsageData } from '../types/RenderContext';

import { ExtraUsageAmountWidget } from './shared/extra-usage-amount-widget';

export class ExtraUsageUsedWidget extends ExtraUsageAmountWidget {
    protected readonly label = 'Overage Used: ';
    protected readonly previewDollars = 106;

    getDescription(): string { return 'Shows extra usage spent: overage beyond Pro/Max plan limits, or your spend on Enterprise'; }
    getDisplayName(): string { return 'Extra Usage Used'; }

    protected getDollars(data: RenderUsageData): number | null {
        // extraUsageUsed is in cents
        return data.extraUsageUsed === undefined ? null : data.extraUsageUsed / 100;
    }
}
