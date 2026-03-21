import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    removeMetadataKeys,
    toggleMetadataFlag
} from './metadata';

export type UsageDisplayMode = 'time' | 'progress' | 'progress-short';

const PROGRESS_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' };
const INVERT_TOGGLE_KEYBIND: CustomKeybind = { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' };
const COMPACT_TOGGLE_KEYBIND: CustomKeybind = { key: 's', label: '(s)hort time', action: 'toggle-compact' };
const CURSOR_TOGGLE_KEYBIND: CustomKeybind = { key: 't', label: '(t)ime cursor', action: 'toggle-cursor' };

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

export function isUsageCursorEnabled(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'cursor');
}

export function toggleUsageCursor(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'cursor');
}

export function toggleUsageCompact(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'compact');
}

interface UsageDisplayModifierOptions { includeCompact?: boolean }

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

    if (isUsageCursorEnabled(item) && isUsageProgressMode(mode)) {
        modifiers.push('time cursor');
    }

    if (options.includeCompact && !isUsageProgressMode(mode) && isUsageCompact(item)) {
        modifiers.push('compact');
    }

    return makeModifierText(modifiers);
}

export function cycleUsageDisplayMode(item: WidgetItem, disabledInProgressKeys: string[] = []): WidgetItem {
    const currentMode = getUsageDisplayMode(item);
    const nextMode: UsageDisplayMode = currentMode === 'time'
        ? 'progress'
        : currentMode === 'progress'
            ? 'progress-short'
            : 'time';

    const nextItem = removeMetadataKeys(item, nextMode === 'time'
        ? ['invert', 'cursor']
        : disabledInProgressKeys);
    const nextMetadata: Record<string, string> = {
        ...(nextItem.metadata ?? {}),
        display: nextMode
    };

    return {
        ...nextItem,
        metadata: nextMetadata
    };
}

export function toggleUsageInverted(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'invert');
}

export function getUsagePercentCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
    const keybinds = [PROGRESS_TOGGLE_KEYBIND];

    if (item && isUsageProgressMode(getUsageDisplayMode(item))) {
        keybinds.push(INVERT_TOGGLE_KEYBIND);
        keybinds.push(CURSOR_TOGGLE_KEYBIND);
    }

    return keybinds;
}

export function getUsageTimerCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
    const keybinds = [PROGRESS_TOGGLE_KEYBIND];

    if (item && isUsageProgressMode(getUsageDisplayMode(item))) {
        keybinds.push(INVERT_TOGGLE_KEYBIND);
    } else {
        keybinds.push(COMPACT_TOGGLE_KEYBIND);
    }

    return keybinds;
}