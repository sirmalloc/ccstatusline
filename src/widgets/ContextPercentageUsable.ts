import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

const USABLE_CONTEXT_RATIO = 0.80; // 80% of max context is usable
const USABLE_TO_FULL_MULTIPLIER = 1 / USABLE_CONTEXT_RATIO; // 1.25

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
        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const isInverse = item.metadata?.inverse === 'true';

        if (context.isPreview) {
            const previewValue = isInverse ? '88.4%' : '11.6%';
            return item.rawValue ? previewValue : `Ctx(u): ${previewValue}`;
        } else if (context.tokenMetrics) {
            // Convert from full context percentage to usable context percentage
            // Usable is 80% of max, so multiply by 1.25 to get percentage of usable
            const usedPercentage = Math.min(100, context.tokenMetrics.usedPercentage * USABLE_TO_FULL_MULTIPLIER);

            const displayPercentage = isInverse ? (100 - usedPercentage) : usedPercentage;
            return item.rawValue ? `${displayPercentage.toFixed(1)}%` : `Ctx(u): ${displayPercentage.toFixed(1)}%`;
        }
        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'l', label: '(l)eft/remaining', action: 'toggle-inverse' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}