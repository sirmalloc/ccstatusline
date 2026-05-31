import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';

import { makeSliderBar } from './usage-display';

export type ContextSliderMode = 'none' | 'slider' | 'slider-only';

const SLIDER_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p)rogress toggle', action: 'toggle-slider' };

export function getContextSliderMode(item: WidgetItem): ContextSliderMode {
    const mode = item.metadata?.display;
    if (mode === 'slider' || mode === 'slider-only') {
        return mode;
    }
    return 'none';
}

export function cycleContextSliderMode(item: WidgetItem): WidgetItem {
    const currentMode = getContextSliderMode(item);
    const nextMode: ContextSliderMode = currentMode === 'none'
        ? 'slider'
        : currentMode === 'slider'
            ? 'slider-only'
            : 'none';

    if (nextMode === 'none') {
        const nextMetadata = { ...(item.metadata ?? {}) };
        delete nextMetadata.display;
        return {
            ...item,
            metadata: Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined
        };
    }

    return {
        ...item,
        metadata: {
            ...(item.metadata ?? {}),
            display: nextMode
        }
    };
}

export function renderContextSlider(mode: ContextSliderMode, percent: number): string | null {
    if (mode === 'none') {
        return null;
    }
    const slider = makeSliderBar(percent);
    if (mode === 'slider') {
        return `${slider} ${percent.toFixed(1)}%`;
    }
    return slider;
}

export function getContextSliderModifierText(item: WidgetItem): string | undefined {
    const mode = getContextSliderMode(item);
    if (mode === 'slider') {
        return '(short bar)';
    }
    if (mode === 'slider-only') {
        return '(short bar only)';
    }
    return undefined;
}

export function getContextSliderKeybinds(): CustomKeybind[] {
    return [SLIDER_TOGGLE_KEYBIND];
}
