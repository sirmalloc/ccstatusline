import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    getAtomicChangeCounts,
    isInsideAtomicRepo
} from '../utils/atomic';

export class AtomicInsertionsWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows atomic insertions count'; }
    getDisplayName(): string { return 'Atomic Insertions'; }
    getCategory(): string { return 'Atomic'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hideNoAtomic = item.metadata?.hideNoAtomic === 'true';
        const modifiers: string[] = [];

        if (hideNoAtomic) {
            modifiers.push('hide \'no atomic\'');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-noatomic') {
            const currentState = item.metadata?.hideNoAtomic === 'true';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    hideNoAtomic: (!currentState).toString()
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoAtomic = item.metadata?.hideNoAtomic === 'true';

        if (context.isPreview) {
            return '+42';
        }

        if (!isInsideAtomicRepo(context)) {
            return hideNoAtomic ? null : '(no atomic)';
        }

        const changes = getAtomicChangeCounts(context);
        return `+${changes.insertions}`;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no atomic\' message', action: 'toggle-noatomic' }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
