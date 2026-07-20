import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import {
    isInsideAtomicRepo,
    runAtomicArgs
} from '../utils/atomic';

export class AtomicDescriptionWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Shows the current atomic change message'; }
    getDisplayName(): string { return 'Atomic Description'; }
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
            return 'initial';
        }

        if (!isInsideAtomicRepo(context)) {
            return hideNoAtomic ? null : 'no atomic';
        }

        const output = runAtomicArgs(['change'], context);
        if (output === null) {
            return hideNoAtomic ? null : 'no atomic';
        }

        const description = this.parseDescription(output);
        return description.length > 0 ? description : '(no description)';
    }

    // `atomic change` renders the message as an indented block after the header
    // (change/Author/Date) and a blank line. Return its first line.
    private parseDescription(output: string): string {
        const lines = output.split(/\r?\n/);
        let seenBlank = false;

        for (const line of lines) {
            if (line.trim().length === 0) {
                seenBlank = true;
                continue;
            }
            if (seenBlank && /^\s/.test(line)) {
                return line.trim();
            }
        }

        return '';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no atomic\' message', action: 'toggle-noatomic' }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
