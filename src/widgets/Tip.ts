import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { advanceTipRotation } from '../utils/tips';

import {
    isMetadataFlagEnabled,
    toggleMetadataFlag
} from './shared/metadata';

const HIDE_WHEN_EMPTY_KEY = 'hideWhenEmpty';

export class TipWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows a rotating tip from version changelogs'; }
    getDisplayName(): string { return 'Tip'; }
    getCategory(): string { return 'Session'; }
    supportsRawValue(): boolean { return true; }
    supportsColors(_item: WidgetItem): boolean { return true; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const modifiers: string[] = [];
        if (isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY)) {
            modifiers.push('hide when empty');
        }
        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide when empty', action: 'toggle-hide-empty' }
        ];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-hide-empty') {
            return toggleMetadataFlag(item, HIDE_WHEN_EMPTY_KEY);
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'Use /help for available commands' : '\uD83D\uDCA1 Use /help for available commands';
        }

        const tip = advanceTipRotation(settings);
        if (!tip) {
            if (isMetadataFlagEnabled(item, HIDE_WHEN_EMPTY_KEY)) {
                return null;
            }
            return item.rawValue ? '(no tips)' : '\uD83D\uDCA1 (no tips)';
        }

        if (item.rawValue) {
            return `${tip.text} · v${tip.version}`;
        }
        // Dim (SGR 2) the version suffix so it reads as metadata. 22 resets dim/bold.
        return `\uD83D\uDCA1 ${tip.text} \x1b[2m· v${tip.version}\x1b[22m`;
    }
}
