import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getCavemanStatus } from '../utils/caveman';

const TOGGLE_SAVINGS_ACTION = 'toggle-savings';
const HIDE_SAVINGS_METADATA_KEY = 'hideSavings';

function isSavingsHidden(item: WidgetItem): boolean {
    return item.metadata?.[HIDE_SAVINGS_METADATA_KEY] === 'true';
}

function toggleSavings(item: WidgetItem): WidgetItem {
    if (!isSavingsHidden(item)) {
        return {
            ...item,
            metadata: {
                ...(item.metadata ?? {}),
                [HIDE_SAVINGS_METADATA_KEY]: 'true'
            }
        };
    }

    const { [HIDE_SAVINGS_METADATA_KEY]: removedHideSavings, ...restMetadata } = item.metadata ?? {};
    void removedHideSavings;

    return {
        ...item,
        metadata: Object.keys(restMetadata).length > 0 ? restMetadata : undefined
    };
}

function formatBadge(mode: string, savings: string | null, showSavings: boolean): string {
    const badge = mode === 'full' ? '[CAVEMAN]' : `[CAVEMAN:${mode.toUpperCase()}]`;
    if (!showSavings || savings === null) {
        return badge;
    }
    return `${badge} ${savings}`;
}

export class CavemanModeWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows the active caveman compression mode badge and token savings'; }
    getDisplayName(): string { return 'Caveman Mode'; }
    getCategory(): string { return 'Core'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return {
            displayText: this.getDisplayName(),
            modifierText: isSavingsHidden(item) ? '(no savings)' : '(savings)'
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === TOGGLE_SAVINGS_ACTION) {
            return toggleSavings(item);
        }

        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const showSavings = !isSavingsHidden(item);

        if (context.isPreview) {
            if (item.rawValue) {
                return 'full';
            }
            return formatBadge('full', '⛏  12.4k', showSavings);
        }

        const status = getCavemanStatus();
        if (status === null) {
            return null;
        }

        if (item.rawValue) {
            return status.mode;
        }

        return formatBadge(status.mode, status.savings, showSavings);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 's', label: '(s)avings', action: TOGGLE_SAVINGS_ACTION }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }
}
