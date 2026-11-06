import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getContextWindowMetrics } from '../utils/context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from '../utils/model-context';
import {
    formatPercent,
    resolveNumberFormat
} from '../utils/number-format';
import { formatTokens } from '../utils/renderer';
import { makeUsageProgressBar } from '../utils/usage';

import {
    CYCLE_GRADIENT_ACTION,
    cycleGradientPreset,
    getGradientKeybinds,
    getGradientModifier,
    paintWidgetBar,
    paintsBarGradient
} from './shared/gradient-bar';
import { makeLineProgressBar } from './shared/progress-bar';
import { formatRawOrLabeledValue } from './shared/raw-or-labeled';
import { makeSliderBar } from './shared/usage-display';

const LABEL = 'Context: ';

type DisplayMode = 'progress' | 'progress-short' | 'slider' | 'slider-only' | 'line';

function getDisplayMode(item: WidgetItem): DisplayMode {
    const mode = item.metadata?.display;
    if (mode === 'progress' || mode === 'slider' || mode === 'slider-only' || mode === 'line') {
        return mode;
    }
    return 'progress-short';
}

function isBarSliderMode(mode: DisplayMode): boolean {
    return mode === 'slider' || mode === 'slider-only';
}

// Nearly full, so the TUI preview shows most of a gradient preset's range
const PREVIEW_USED_TOKENS = 180000;
const PREVIEW_WINDOW_TOKENS = 200000;
const PREVIEW_PERCENT = 90;

export class ContextBarWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Shows context usage as a progress bar'; }
    getDisplayName(): string { return 'Context Bar'; }
    getCategory(): string { return 'Context'; }
    getLabelPrefix(): string { return LABEL; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const mode = getDisplayMode(item);
        const modifiers: string[] = [];

        if (mode === 'progress-short') {
            modifiers.push('medium bar');
        } else if (mode === 'slider') {
            modifiers.push('short bar');
        } else if (mode === 'slider-only') {
            modifiers.push('short bar only');
        } else if (mode === 'line') {
            modifiers.push('line bar');
        }
        const gradient = getGradientModifier(item);
        if (gradient) {
            modifiers.push(gradient);
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === CYCLE_GRADIENT_ACTION) {
            return cycleGradientPreset(item);
        }
        if (action !== 'toggle-progress') {
            return null;
        }

        const currentMode = getDisplayMode(item);
        const nextMode: DisplayMode = currentMode === 'progress-short'
            ? 'progress'
            : currentMode === 'progress'
                ? 'slider'
                : currentMode === 'slider'
                    ? 'slider-only'
                    : currentMode === 'slider-only'
                        ? 'line'
                        : 'progress-short';

        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                display: nextMode
            }
        };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const displayMode = getDisplayMode(item);
        const tokenFormat = resolveNumberFormat('token', item, settings);
        const percentFormat = resolveNumberFormat('percent', item, settings);

        if (context.isPreview) {
            const usedDisplay = formatTokens(PREVIEW_USED_TOKENS, tokenFormat, 0);
            const totalDisplay = formatTokens(PREVIEW_WINDOW_TOKENS, tokenFormat, 0);
            const percentDisplay = formatPercent(PREVIEW_PERCENT, percentFormat, 0);
            if (isBarSliderMode(displayMode)) {
                const slider = paintWidgetBar(makeSliderBar(PREVIEW_PERCENT), item, settings);
                const sliderDisplay = displayMode === 'slider' ? `${slider} ${usedDisplay}/${totalDisplay} (${percentDisplay})` : slider;
                return formatRawOrLabeledValue(item, this.getLabelPrefix(), sliderDisplay);
            }
            const barWidth = displayMode === 'progress' ? 32 : 16;
            const previewBar = displayMode === 'line' ? makeLineProgressBar(PREVIEW_PERCENT) : makeUsageProgressBar(PREVIEW_PERCENT, barWidth);
            const previewDisplay = `${paintWidgetBar(previewBar, item, settings)} ${usedDisplay}/${totalDisplay} (${percentDisplay})`;
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), previewDisplay);
        }

        const contextWindowMetrics = getContextWindowMetrics(context.data);

        const modelIdentifier = getModelContextIdentifier(context.data?.model);
        const total = getContextConfig(modelIdentifier, contextWindowMetrics.windowSize).maxTokens;
        let used = contextWindowMetrics.contextLengthTokens;

        if (used === null && context.tokenMetrics) {
            used = context.tokenMetrics.contextLength;
        }

        if (used === null || total <= 0) {
            return null;
        }

        const percent = (used / total) * 100;
        const clampedPercent = Math.max(0, Math.min(100, percent));
        const usedDisplay = formatTokens(used, tokenFormat, 0);
        const totalDisplay = formatTokens(total, tokenFormat, 0);
        const percentDisplay = formatPercent(clampedPercent, percentFormat, 0);

        if (isBarSliderMode(displayMode)) {
            const slider = paintWidgetBar(makeSliderBar(clampedPercent), item, settings);
            const sliderDisplay = displayMode === 'slider' ? `${slider} ${usedDisplay}/${totalDisplay} (${percentDisplay})` : slider;
            return formatRawOrLabeledValue(item, this.getLabelPrefix(), sliderDisplay);
        }

        const barWidth = displayMode === 'progress' ? 32 : 16;
        const bar = displayMode === 'line' ? makeLineProgressBar(clampedPercent) : makeUsageProgressBar(clampedPercent, barWidth);
        const display = `${paintWidgetBar(bar, item, settings)} ${usedDisplay}/${totalDisplay} (${percentDisplay})`;

        return formatRawOrLabeledValue(item, this.getLabelPrefix(), display);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'p', label: '(p)rogress toggle', action: 'toggle-progress' },
            ...getGradientKeybinds(true)
        ];
    }

    // A gradient preset paints only the bar, so the renderer colors the rest
    colorsOnlyItsRuns(item: WidgetItem): boolean {
        return paintsBarGradient(item, true);
    }

    supportsRawValue(): boolean { return true; }

    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
