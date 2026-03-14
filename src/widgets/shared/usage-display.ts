import type { WidgetItem } from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './metadata';

export type UsageDisplayMode = 'time' | 'progress' | 'progress-short';

export function getUsageDisplayMode(item: WidgetItem): UsageDisplayMode {
    const mode = item.metadata?.display;
    if (mode === 'progress' || mode === 'progress-short') {
        return mode;
    }
    return 'time';
}

export function isUsageProgressMode(mode: UsageDisplayMode): boolean {
    return mode === 'progress' || mode === 'progress-short';
}

export function getUsageProgressBarWidth(mode: UsageDisplayMode): number {
    return mode === 'progress' ? 32 : 16;
}

export function isUsageInverted(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'invert');
}

export function isUsageCompact(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'compact');
}

export function toggleUsageCompact(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'compact');
}

export function isUsageDaysHours(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'daysHours');
}

export function toggleUsageDaysHours(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'daysHours');
}

interface UsageDisplayModifierOptions { includeCompact?: boolean; includeDaysHours?: boolean }

export function getUsageDisplayModifierText(
    item: WidgetItem,
    options: UsageDisplayModifierOptions = {}
): string | undefined {
    const mode = getUsageDisplayMode(item);
    const modifiers: string[] = [];

    if (mode === 'progress') {
        modifiers.push('progress bar');
    } else if (mode === 'progress-short') {
        modifiers.push('short bar');
    }

    if (isUsageInverted(item)) {
        modifiers.push('inverted');
    }

    if (options.includeCompact && isUsageCompact(item)) {
        modifiers.push('compact');
    }

    if (options.includeDaysHours && isUsageDaysHours(item)) {
        modifiers.push('days+hours');
    }

    return makeModifierText(modifiers);
}

export function cycleUsageDisplayMode(item: WidgetItem): WidgetItem {
    const currentMode = getUsageDisplayMode(item);
    const nextMode: UsageDisplayMode = currentMode === 'time'
        ? 'progress'
        : currentMode === 'progress'
            ? 'progress-short'
            : 'time';

    const nextMetadata: Record<string, string> = {
        ...(item.metadata ?? {}),
        display: nextMode
    };

    if (nextMode === 'time') {
        delete nextMetadata.invert;
    }

    return {
        ...item,
        metadata: nextMetadata
    };
}

export function toggleUsageInverted(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'invert');
}