import { UsagePercentWidget } from './shared/usage-percent-widget';

export class SpendLimitUsageWidget extends UsagePercentWidget {
    constructor() {
        super('spend-limit');
    }

    override getDefaultColor(): string { return 'brightMagenta'; }
}
