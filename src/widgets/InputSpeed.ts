import type { RenderContext } from '../types/RenderContext';
import { DEFAULT_SETTINGS, type Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { parseSpeed } from '../utils/value-parsers';

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
        void settings;
        return renderSpeedWidgetValue('input', item, context);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getSpeedWidgetCustomKeybinds();
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSpeedWidgetEditor(props);
    }

    getValueType(): 'number' {
        return 'number';
    }

    getValue(context: RenderContext, item: WidgetItem): number | null {
        const rendered = this.render({ ...item, rawValue: true }, context, DEFAULT_SETTINGS);
        if (!rendered) return null;
        return parseSpeed(rendered);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}