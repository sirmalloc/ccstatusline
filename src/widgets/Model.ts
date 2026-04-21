import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    DISCRETE_COLOR_PALETTE,
    hashStringToColor
} from '../utils/colors';

function resolveModelName(context: RenderContext): string | null {
    const model = context.data?.model;
    const modelDisplayName = typeof model === 'string'
        ? model
        : (model?.display_name ?? model?.id);

    if (!modelDisplayName) {
        return null;
    }

    return modelDisplayName.replace(/\s*\(.*\)$/, '');
}

export class ModelWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return 'Displays the Claude model name (e.g., Claude 3.5 Sonnet)'; }
    getDisplayName(): string { return 'Model'; }
    getCategory(): string { return 'Core'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    getDiscreteValues(): string[] {
        return ['Sonnet', 'Opus', 'Haiku'];
    }

    getEffectiveColor(context: RenderContext, item: WidgetItem): string | null {
        if (item.metadata?.colorMode !== 'dynamic') {
            return null;
        }

        const shortName = context.isPreview ? 'Claude' : resolveModelName(context);
        if (!shortName) {
            return null;
        }

        // Check explicit colorMap entries (case-insensitive substring match)
        for (const [key, value] of Object.entries(item.metadata ?? {})) {
            if (!key.startsWith('colorMap:')) {
                continue;
            }
            const mapKey = key.slice(9);
            if (shortName.toLowerCase().includes(mapKey.toLowerCase())) {
                return value;
            }
        }

        // Fallback: hash the model name to a color
        return hashStringToColor(shortName, DISCRETE_COLOR_PALETTE);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'Claude' : 'Model: Claude';
        }

        const shortName = resolveModelName(context);
        if (shortName) {
            return item.rawValue ? shortName : `Model: ${shortName}`;
        }
        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}