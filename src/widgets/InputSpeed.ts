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
    getSpeedWidgetCustomKeybinds,
    getSpeedWidgetDescription,
    getSpeedWidgetDisplayName,
    getSpeedWidgetEditorDisplay,
    renderSpeedWidgetEditor,
    renderSpeedWidgetValue
} from './shared/speed-widget';

export class InputSpeedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return getSpeedWidgetDescription('input'); }
    getDisplayName(): string { return getSpeedWidgetDisplayName('input'); }
    getCategory(): string { return 'Token Speed'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getSpeedWidgetEditorDisplay('input', item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderSpeedWidgetValue('input', item, context, settings);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getSpeedWidgetCustomKeybinds();
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSpeedWidgetEditor(props);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
