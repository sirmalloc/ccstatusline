import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import {
    DEFAULT_RESET_LOCALE,
    canonicalizeLocale
} from '../../utils/locales';

import { makeModifierText } from './editor-display';
import {
    isMetadataFlagEnabled,
    removeMetadataKeys,
    toggleMetadataFlag
} from './metadata';

export type UsageDisplayMode = 'time' | 'progress' | 'progress-short' | 'slider' | 'slider-only';

const SLIDER_WIDTH = 10;

const PROGRESS_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' };
const INVERT_TOGGLE_KEYBIND: CustomKeybind = { key: 'v', label: 'in(v)ert fill', action: 'toggle-invert' };
const COMPACT_TOGGLE_KEYBIND: CustomKeybind = { key: 's', label: '(s)hort time', action: 'toggle-compact' };
const DATE_TOGGLE_KEYBIND: CustomKeybind = { key: 't', label: '(t)imestamp', action: 'toggle-date' };
const HOUR_FORMAT_TOGGLE_KEYBIND: CustomKeybind = { key: 'h', label: '12/24 (h)our', action: 'toggle-hour-format' };
const TIMEZONE_KEYBIND: CustomKeybind = { key: 'z', label: 'time(z)one', action: 'edit-timezone' };
const LOCALE_KEYBIND: CustomKeybind = { key: 'l', label: '(l)ocale', action: 'edit-locale' };

export function getUsageDisplayMode(item: WidgetItem): UsageDisplayMode {
    const mode = item.metadata?.display;
    if (mode === 'progress' || mode === 'progress-short' || mode === 'slider' || mode === 'slider-only') {
        return mode;
    }
    return 'time';
}

export function isUsageProgressMode(mode: UsageDisplayMode): boolean {
    return mode === 'progress' || mode === 'progress-short';
}

export function isUsageSliderMode(mode: UsageDisplayMode): boolean {
    return mode === 'slider' || mode === 'slider-only';
}

export function makeSliderBar(percent: number, width: number = SLIDER_WIDTH): string {
    const clamped = Math.max(0, Math.min(100, percent));
    const filled = Math.round((clamped / 100) * width);
    const empty = width - filled;
    return '▓'.repeat(filled) + '░'.repeat(empty);
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

export function isUsageDateMode(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'absolute');
}

export function isUsage12HourClock(item: WidgetItem): boolean {
    return isMetadataFlagEnabled(item, 'hour12');
}

export function getUsageTimezone(item: WidgetItem): string | undefined {
    const tz = item.metadata?.timezone;
    return typeof tz === 'string' && tz.length > 0 ? tz : undefined;
}

export function getUsageLocale(item: WidgetItem): string | undefined {
    const locale = item.metadata?.locale;
    return typeof locale === 'string' && locale.length > 0 ? locale : undefined;
}

export function getUsageLocaleModifier(item: WidgetItem): string | undefined {
    const locale = getUsageLocale(item);
    return locale ? `locale: ${locale}` : undefined;
}

export function getUsageTimezoneModifier(item: WidgetItem): string | undefined {
    const timezone = getUsageTimezone(item);
    return timezone ? `tz: ${timezone}` : undefined;
}

export function setUsageTimezone(item: WidgetItem, timezone: string): WidgetItem {
    if (timezone === 'UTC') {
        return removeMetadataKeys(item, ['timezone']);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            timezone
        }
    };
}

export function setUsageLocale(item: WidgetItem, locale: string): WidgetItem {
    const canonicalLocale = canonicalizeLocale(locale);
    if (!canonicalLocale || canonicalLocale === DEFAULT_RESET_LOCALE) {
        return removeMetadataKeys(item, ['locale']);
    }

    return {
        ...item,
        metadata: {
            ...item.metadata,
            locale: canonicalLocale
        }
    };
}

export function toggleUsageCompact(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'compact');
}

export function toggleUsageDateMode(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'absolute');
}

export function toggleUsageHourFormat(item: WidgetItem): WidgetItem {
    return toggleMetadataFlag(item, 'hour12');
}

interface UsageDisplayModifierOptions {
    includeCompact?: boolean;
    includeDate?: boolean;
}

export function getUsageDisplayModifierText(
    item: WidgetItem,
    options: UsageDisplayModifierOptions = {}
): string | undefined {
    const mode = getUsageDisplayMode(item);
    const modifiers: string[] = [];

    if (mode === 'progress') {
        modifiers.push('long bar');
    } else if (mode === 'progress-short') {
        modifiers.push('medium bar');
    } else if (mode === 'slider') {
        modifiers.push('short bar');
    } else if (mode === 'slider-only') {
        modifiers.push('short bar only');
    }

    if (isUsageInverted(item)) {
        modifiers.push('inverted');
    }

    if (options.includeCompact && !isUsageProgressMode(mode) && isUsageCompact(item)) {
        modifiers.push('compact');
    }

    if (options.includeDate && !isUsageProgressMode(mode) && isUsageDateMode(item)) {
        modifiers.push('date');
    }

    if (options.includeDate && !isUsageProgressMode(mode) && isUsageDateMode(item) && isUsage12HourClock(item)) {
        modifiers.push('12hr');
    }

    const timezoneModifier = getUsageTimezoneModifier(item);
    if (options.includeDate && !isUsageProgressMode(mode) && isUsageDateMode(item) && timezoneModifier) {
        modifiers.push(timezoneModifier);
    }

    const localeModifier = getUsageLocaleModifier(item);
    if (options.includeDate && !isUsageProgressMode(mode) && isUsageDateMode(item) && localeModifier) {
        modifiers.push(localeModifier);
    }

    return makeModifierText(modifiers);
}

export function cycleUsageDisplayMode(item: WidgetItem, disabledInProgressKeys: string[] = [], includeSlider = false): WidgetItem {
    const currentMode = getUsageDisplayMode(item);
    let nextMode: UsageDisplayMode;
    if (includeSlider) {
        nextMode = currentMode === 'time'
            ? 'progress'
            : currentMode === 'progress'
                ? 'progress-short'
                : currentMode === 'progress-short'
                    ? 'slider'
                    : currentMode === 'slider'
                        ? 'slider-only'
                        : 'time';
    } else {
        nextMode = currentMode === 'time'
            ? 'progress'
            : currentMode === 'progress'
                ? 'progress-short'
                : 'time';
    }

    const nextItem = removeMetadataKeys(item, nextMode === 'time'
        ? ['invert']
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

    if (item) {
        const mode = getUsageDisplayMode(item);
        if (isUsageProgressMode(mode) || isUsageSliderMode(mode)) {
            keybinds.push(INVERT_TOGGLE_KEYBIND);
        }
    }

    return keybinds;
}

interface UsageTimerCustomKeybindOptions {
    includeDate?: boolean;
    includeHourFormat?: boolean;
    includeLocale?: boolean;
    includeTimezone?: boolean;
}

export function getUsageTimerCustomKeybinds(
    item?: WidgetItem,
    options: UsageTimerCustomKeybindOptions = {}
): CustomKeybind[] {
    const keybinds = [PROGRESS_TOGGLE_KEYBIND];

    if (item && isUsageProgressMode(getUsageDisplayMode(item))) {
        keybinds.push(INVERT_TOGGLE_KEYBIND);
    } else {
        keybinds.push(COMPACT_TOGGLE_KEYBIND);

        if (options.includeDate) {
            keybinds.push(DATE_TOGGLE_KEYBIND);
        }
    }

    if (item && isUsageDateMode(item) && !isUsageProgressMode(getUsageDisplayMode(item))) {
        if (options.includeHourFormat) {
            keybinds.push(HOUR_FORMAT_TOGGLE_KEYBIND);
        }

        if (options.includeTimezone) {
            keybinds.push(TIMEZONE_KEYBIND);
        }

        if (options.includeLocale) {
            keybinds.push(LOCALE_KEYBIND);
        }
    }

    return keybinds;
}
