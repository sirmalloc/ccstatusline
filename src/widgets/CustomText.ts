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

export class CustomTextWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Displays user-defined custom text'; }
    getDisplayName(): string { return 'Custom Text'; }
    getCategory(): string { return 'Custom'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const text = item.customText ?? 'Empty';
        return { displayText: `${this.getDisplayName()} (${text})` };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return item.customText ?? '';
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [{
            key: 'e',
            label: '(e)dit text',
            action: 'edit-text'
        }];
    }

    // The actual hiding happens in the renderer, which resolves the merge
    // target's rendered output (see applyMergeTargetHiding)
    getHideableStates(): HideableState[] {
        return [MERGE_TARGET_HIDDEN_HIDEABLE_STATE];
    }

    renderEditor(props: WidgetEditorProps): WidgetEditorDescriptor {
        return { kind: 'custom-text', props };
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
