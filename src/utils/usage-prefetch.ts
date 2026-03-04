import type { WidgetItem } from '../types/Widget';

import type { UsageData } from './usage';
import { fetchUsageData } from './usage';

const USAGE_WIDGET_TYPES = new Set<string>([
    'session-usage',
    'weekly-usage',
    'block-timer',
    'reset-timer',
    'weekly-reset-timer'
]);

export function hasUsageDependentWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => USAGE_WIDGET_TYPES.has(item.type)));
}

export async function prefetchUsageDataIfNeeded(lines: WidgetItem[][]): Promise<UsageData | null> {
    if (!hasUsageDependentWidgets(lines)) {
        return null;
    }

    return await fetchUsageData();
}