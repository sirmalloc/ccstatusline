import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getChalkColor,
    getHeatGaugeColor
} from '../utils/colors';
import { getContextConfig } from '../utils/model-context';

export class ContextPercentageUsableWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows percentage of usable context window used or remaining (80% of max before auto-compact)'; }
    getDisplayName(): string { return 'Context % (usable)'; }
    getCategory(): string { return 'Context'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const isInverse = item.metadata?.inverse === 'true';
        const heatGaugeOn = item.heatGaugeColors ?? true;
        const modifiers: string[] = [];

        if (isInverse) {
            modifiers.push('remaining');
        }
        modifiers.push(`heat:${heatGaugeOn ? 'ON' : 'OFF'}`);

        return {
            displayText: this.getDisplayName(),
            modifierText: `(${modifiers.join(', ')})`
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-inverse') {
            const currentState = item.metadata?.inverse === 'true';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    inverse: (!currentState).toString()
                }
            };
        }
        if (action === 'toggle-heat-gauge') {
            return { ...item, heatGaugeColors: !(item.heatGaugeColors ?? true) };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const isInverse = item.metadata?.inverse === 'true';
        const useHeatGauge = item.heatGaugeColors ?? true;

        if (context.isPreview) {
            const previewValue = isInverse ? '88.4%' : '11.6%';
            const previewPercentage = isInverse ? 88.4 : 11.6;
            if (useHeatGauge) {
                const heatColor = getHeatGaugeColor(previewPercentage, settings.heatGaugeThresholds);
                const chalkColor = getChalkColor(heatColor, 'truecolor');
                const coloredValue = chalkColor ? chalkColor(previewValue) : previewValue;
                return item.rawValue ? coloredValue : `Ctx(u): ${coloredValue}`;
            }
            return item.rawValue ? previewValue : `Ctx(u): ${previewValue}`;
        }

        // Prefer context_window data from Claude Code (v2.0.65+)
        if (context.contextWindow && context.contextWindow.contextWindowSize > 0) {
            const usableTokens = context.contextWindow.contextWindowSize * 0.8;
            const usedPercentage = Math.min(100, (context.contextWindow.totalInputTokens / usableTokens) * 100);
            const displayPercentage = isInverse ? (100 - usedPercentage) : usedPercentage;
            const percentageString = `${displayPercentage.toFixed(1)}%`;

            if (useHeatGauge) {
                const heatColor = getHeatGaugeColor(displayPercentage, settings.heatGaugeThresholds);
                const chalkColor = getChalkColor(heatColor, 'truecolor');
                const coloredPercentage = chalkColor ? chalkColor(percentageString) : percentageString;
                return item.rawValue ? coloredPercentage : `Ctx(u): ${coloredPercentage}`;
            }
            return item.rawValue ? percentageString : `Ctx(u): ${percentageString}`;
        }

        // Fall back to transcript-based metrics with model lookup
        if (context.tokenMetrics) {
            const model = context.data?.model;
            const modelId = typeof model === 'string' ? model : model?.id;
            const contextConfig = getContextConfig(modelId);
            const usedPercentage = Math.min(100, (context.tokenMetrics.contextLength / contextConfig.usableTokens) * 100);
            const displayPercentage = isInverse ? (100 - usedPercentage) : usedPercentage;
            const percentageString = `${displayPercentage.toFixed(1)}%`;

            if (useHeatGauge) {
                const heatColor = getHeatGaugeColor(displayPercentage, settings.heatGaugeThresholds);
                const chalkColor = getChalkColor(heatColor, 'truecolor');
                const coloredPercentage = chalkColor ? chalkColor(percentageString) : percentageString;
                return item.rawValue ? coloredPercentage : `Ctx(u): ${coloredPercentage}`;
            }
            return item.rawValue ? percentageString : `Ctx(u): ${percentageString}`;
        }

        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'l', label: '(l)eft/remaining', action: 'toggle-inverse' },
            { key: 'h', label: '(h)eat gauge on/off', action: 'toggle-heat-gauge' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}