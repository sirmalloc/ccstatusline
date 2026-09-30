import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDescriptor,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';

import { MERGE_TARGET_HIDDEN_HIDEABLE_STATE } from './shared/hideable';

export class CustomSymbolWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Displays a custom symbol or emoji (single character)'; }
    getDisplayName(): string { return 'Custom Symbol'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const symbol = item.customSymbol ?? '?';
        return { displayText: `${this.getDisplayName()} (${symbol})` };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return item.customSymbol ?? '';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{
            key: 'e',
            label: '(e)dit symbol',
            action: 'edit-symbol'
        }];
    }

    // The actual hiding happens in the renderer, which resolves the merge
    // target's rendered output (see applyMergeTargetHiding)
    getHideableStates(): HideableState[] {
        return [MERGE_TARGET_HIDDEN_HIDEABLE_STATE];
    }

    renderEditor(props: WidgetEditorProps): WidgetEditorDescriptor {
        return { kind: 'custom-symbol', props };
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
