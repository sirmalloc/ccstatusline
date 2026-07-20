import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import {
    isInsideAtomicRepo,
    runAtomicArgs
} from '../utils/atomic';

import {
    formatSymbolPrefix,
    getSymbolKeybind,
    renderSymbolOverrideEditor
} from './shared/symbol-override';

const DEFAULT_SYMBOL = '⎇';

export class AtomicViewWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current atomic view (branch equivalent)'; }
    getDisplayName(): string { return 'Atomic View'; }
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
        const prefix = formatSymbolPrefix(item, DEFAULT_SYMBOL);

        if (context.isPreview) {
            return item.rawValue ? 'dev' : `${prefix}dev`;
        }

        if (!isInsideAtomicRepo(context)) {
            return hideNoAtomic ? null : `${prefix}no atomic`;
        }

        const view = this.getAtomicView(context);
        if (view) {
            return item.rawValue ? view : `${prefix}${view}`;
        }

        return hideNoAtomic ? null : `${prefix}no atomic`;
    }

    private getAtomicView(context: RenderContext): string | null {
        const output = runAtomicArgs(['view', 'list'], context);
        if (!output) {
            return null;
        }

        // The current view is marked with a leading '* '; others are indented.
        for (const line of output.split(/\r?\n/)) {
            const match = /^\*\s+(\S+)/.exec(line);
            if (match?.[1]) {
                return match[1];
            }
        }

        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no atomic\' message', action: 'toggle-noatomic' },
            getSymbolKeybind()
        ];
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSymbolOverrideEditor(props, DEFAULT_SYMBOL);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(): boolean { return true; }
}
