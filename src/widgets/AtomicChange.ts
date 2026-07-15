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

export class AtomicChangeWidget implements Widget {
    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows the current atomic change hash'; }
    getDisplayName(): string { return 'Atomic Change'; }
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
            return item.rawValue ? 'KQNCPFYKX576' : ' KQNCPFYKX576';
        }

        if (!isInsideAtomicRepo(context)) {
            return hideNoAtomic ? null : ' no atomic';
        }

        const hash = this.getAtomicChange(context);
        if (hash) {
            return item.rawValue ? hash : ` ${hash}`;
        }

        return hideNoAtomic ? null : ' no atomic';
    }

    private getAtomicChange(context: RenderContext): string | null {
        const output = runAtomicArgs(['change'], context);
        if (!output) {
            return null;
        }

        // First line looks like: `change KQNCPFYKX576 (#2)`
        const firstLine = output.split(/\r?\n/)[0] ?? '';
        const match = /^change\s+(\S+)/.exec(firstLine);
        return match?.[1] ?? null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no atomic\' message', action: 'toggle-noatomic' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
