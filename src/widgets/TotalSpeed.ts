import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
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
    getSpeedWidgetHideableStates,
    renderSpeedWidgetEditor,
    renderSpeedWidgetValue
} from './shared/speed-widget';

export class TotalSpeedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return getSpeedWidgetDescription('total'); }
    getDisplayName(): string { return getSpeedWidgetDisplayName('total'); }
    getCategory(): string { return 'Token Speed'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getSpeedWidgetEditorDisplay('total', item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        void settings;
        return renderSpeedWidgetValue('total', item, context);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getSpeedWidgetCustomKeybinds();
    }

    getHideableStates(): HideableState[] {
        return getSpeedWidgetHideableStates();
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSpeedWidgetEditor(props);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
