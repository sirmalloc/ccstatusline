import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    HideableState,
    WidgetItem
} from '../types/Widget';

import { isHidden } from './shared/hideable';
import {
    SESSION_AT_LIMIT_HIDEABLE_STATE,
    isAtSessionLimit
} from './shared/usage-display';
import { UsagePercentWidget } from './shared/usage-percent-widget';

export class SessionUsageWidget extends UsagePercentWidget {
    constructor() {
        super('session');
    }

    override getHideableStates(): HideableState[] {
        return [...super.getHideableStates(), SESSION_AT_LIMIT_HIDEABLE_STATE];
    }

    override render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        // The preview keeps its sample
        if (!context.isPreview && isHidden(item, SESSION_AT_LIMIT_HIDEABLE_STATE.key) && isAtSessionLimit(context)) {
            return null;
        }
        return super.render(item, context, settings);
    }
}
