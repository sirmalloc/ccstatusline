import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class ContextPercentageUsableWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows percentage of usable context window used or remaining (of 160k tokens before auto-compact)'; }
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

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const isInverse = item.metadata?.inverse === 'true';

        if (context.isPreview) {
            const previewValue = isInverse ? '88.4%' : '11.6%';
            return item.rawValue ? previewValue : `Ctx(u): ${previewValue}`;
        } else if (context.tokenMetrics) {
            const usedPercentage = Math.min(100, (context.tokenMetrics.contextLength / 160000) * 100);
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