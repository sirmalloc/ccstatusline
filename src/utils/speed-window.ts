import type { WidgetItem } from '../types/Widget';

export const SPEED_WINDOW_METADATA_KEY = 'windowSeconds';
export const DEFAULT_SPEED_WINDOW_SECONDS = 0;
export const MIN_SPEED_WINDOW_SECONDS = 0;
export const MAX_SPEED_WINDOW_SECONDS = 120;

export function clampSpeedWindowSeconds(value: number): number {
    if (!Number.isFinite(value)) {
        return DEFAULT_SPEED_WINDOW_SECONDS;
    }

    const normalized = Math.trunc(value);
    if (normalized < MIN_SPEED_WINDOW_SECONDS) {
        return MIN_SPEED_WINDOW_SECONDS;
    }
    if (normalized > MAX_SPEED_WINDOW_SECONDS) {
        return MAX_SPEED_WINDOW_SECONDS;
    }
    return normalized;
}

export function getWidgetSpeedWindowSeconds(item: WidgetItem): number {
    const metadataValue = item.metadata?.[SPEED_WINDOW_METADATA_KEY];
    if (!metadataValue) {
        return DEFAULT_SPEED_WINDOW_SECONDS;
    }

    const parsed = Number.parseInt(metadataValue, 10);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_SPEED_WINDOW_SECONDS;
    }

    return clampSpeedWindowSeconds(parsed);
}

export function isWidgetSpeedWindowEnabled(item: WidgetItem): boolean {
    return getWidgetSpeedWindowSeconds(item) > 0;
}

export function withWidgetSpeedWindowSeconds(item: WidgetItem, seconds: number): WidgetItem {
    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            [SPEED_WINDOW_METADATA_KEY]: clampSpeedWindowSeconds(seconds).toString()
        }
    };
}