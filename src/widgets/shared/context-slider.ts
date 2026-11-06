import type { NumberFormat } from '../../types/NumberFormat';
import type {
    CustomKeybind,
    WidgetItem
} from '../../types/Widget';
import { formatPercent } from '../../utils/number-format';

import {
    CYCLE_GRADIENT_ACTION,
    cycleGradientPreset,
    getGradientKeybinds,
    getGradientModifier
} from './gradient-bar';
import { makeLineProgressBar } from './progress-bar';
import { makeSliderBar } from './usage-display';

export type ContextSliderMode = 'none' | 'slider' | 'slider-only' | 'line';

const SLIDER_TOGGLE_KEYBIND: CustomKeybind = { key: 'p', label: '(p)rogress toggle', action: 'toggle-slider' };

export function getContextSliderMode(item: WidgetItem): ContextSliderMode {
    const mode = item.metadata?.display;
    if (mode === 'slider' || mode === 'slider-only' || mode === 'line') {
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
            : currentMode === 'slider-only'
                ? 'line'
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

export function renderContextSlider(mode: ContextSliderMode, percent: number, format: NumberFormat = {}): string | null {
    if (mode === 'none') {
        return null;
    }
    if (mode === 'line') {
        return `${makeLineProgressBar(percent)} ${formatPercent(percent, format)}`;
    }
    const slider = makeSliderBar(percent);
    if (mode === 'slider') {
        return `${slider} ${formatPercent(percent, format)}`;
    }
    return slider;
}

export function getContextSliderModifierText(item: WidgetItem): string | undefined {
    const mode = getContextSliderMode(item);
    if (mode === 'none') {
        return undefined;
    }
    const gradientModifier = getGradientModifier(item);
    const barModifier = mode === 'slider' ? 'short bar' : mode === 'slider-only' ? 'short bar only' : 'line bar';
    return gradientModifier ? `(${barModifier}, ${gradientModifier})` : `(${barModifier})`;
}

export function getContextSliderKeybinds(item?: WidgetItem): CustomKeybind[] {
    return [SLIDER_TOGGLE_KEYBIND, ...getGradientKeybinds(item ? getContextSliderMode(item) !== 'none' : false)];
}

// The slider and gradient actions; null for anything else
export function handleContextSliderAction(action: string, item: WidgetItem): WidgetItem | null {
    if (action === 'toggle-slider') {
        return cycleContextSliderMode(item);
    }
    if (action === CYCLE_GRADIENT_ACTION) {
        return cycleGradientPreset(item);
    }
    return null;
}
