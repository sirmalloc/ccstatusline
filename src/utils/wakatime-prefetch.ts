import type { WidgetItem } from '../types/Widget';

import type { WakatimeData } from './wakatime-fetch';
import { fetchWakatimeData } from './wakatime-fetch';

const WAKATIME_WIDGET_TYPES = new Set<string>(['wakatime-today']);

export function hasWakatimeDependentWidgets(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(item => WAKATIME_WIDGET_TYPES.has(item.type)));
}

export async function prefetchWakatimeDataIfNeeded(lines: WidgetItem[][]): Promise<WakatimeData | null> {
    if (!hasWakatimeDependentWidgets(lines)) {
        return null;
    }

    return fetchWakatimeData();
}
