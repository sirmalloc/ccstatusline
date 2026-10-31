import type { RenderContext } from '../types/RenderContext';

import { LimitTimerWidget } from './shared/limit-timer-widget';

export class BlockLimitTimerWidget extends LimitTimerWidget {
    protected readonly label = 'Limit in: ';
    protected readonly previewLimitInMs = 73 * 60 * 1000;

    getDescription(): string { return 'Time until the 5-hour block\'s limit at the current pace; shown only when that comes before the reset'; }
    getDisplayName(): string { return 'Block Limit Timer'; }

    protected getLimitInMs(context: RenderContext): number | null {
        return context.sessionForecast?.limitInMs ?? null;
    }
}
