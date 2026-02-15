import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    THRESHOLD_CYCLE_ORDER,
    getCurrentPreset,
    getContextThresholdColor,
    getPresetLabel
} from '../utils/color-thresholds';
import { getContextConfig } from '../utils/model-context';

export class ContextPercentageUsableWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows percentage of usable context window used or remaining (80% of max before auto-compact)'; }
    getDisplayName(): string { return 'Context % (usable)'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const isInverse = item.metadata?.inverse === 'true';
        const modifiers: string[] = [];

        if (isInverse) {
            modifiers.push('remaining');
        }

        const preset = getCurrentPreset(item);
        modifiers.push(getPresetLabel(preset));

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
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
        if (action === 'cycle-thresholds') {
            const current = getCurrentPreset(item);
            const currentIndex = THRESHOLD_CYCLE_ORDER.indexOf(current);
            const nextPreset = THRESHOLD_CYCLE_ORDER[(currentIndex + 1) % THRESHOLD_CYCLE_ORDER.length] ?? 'default';
            const { colorThresholds, thresholdPreset, ...restMetadata } = item.metadata ?? {};
            void colorThresholds; void thresholdPreset;
            if (nextPreset === 'off') {
                return {
                    ...item,
                    metadata: { ...restMetadata, colorThresholds: 'false' }
                };
            }
            return {
                ...item,
                metadata: { ...restMetadata, thresholdPreset: nextPreset }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const isInverse = item.metadata?.inverse === 'true';

        if (context.isPreview) {
            const previewValue = isInverse ? '88.4%' : '11.6%';
            return item.rawValue ? previewValue : `Ctx(u): ${previewValue}`;
        } else if (context.tokenMetrics) {
            const model = context.data?.model;
            const modelId = typeof model === 'string' ? model : model?.id;
            const contextConfig = getContextConfig(modelId);
            const usedPercentage = Math.min(100, (context.tokenMetrics.contextLength / contextConfig.usableTokens) * 100);
            const displayPercentage = isInverse ? (100 - usedPercentage) : usedPercentage;
            return item.rawValue ? `${displayPercentage.toFixed(1)}%` : `Ctx(u): ${displayPercentage.toFixed(1)}%`;
        }
        return null;
    }

    getEffectiveColor(item: WidgetItem, context: RenderContext, settings: Settings): string | undefined {
        if (context.isPreview) return undefined;
        if (!context.tokenMetrics) return undefined;

        const model = context.data?.model;
        const modelId = typeof model === 'string' ? model : model?.id;
        const contextConfig = getContextConfig(modelId);
        // Use usableTokens for the usable variant
        const usedPercentage = Math.min(100, (context.tokenMetrics.contextLength / contextConfig.usableTokens) * 100);

        return getContextThresholdColor(item, usedPercentage);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'l', label: '(l)eft/remaining', action: 'toggle-inverse' },
            { key: 't', label: '(t)hresholds', action: 'cycle-thresholds' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}