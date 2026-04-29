import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetEditorProps,
    WidgetItem
} from '../types/Widget';
import { parseSpeed } from '../utils/value-parsers';
import { getValueFromRender } from '../utils/widget-values';

import {
    getSpeedWidgetCustomKeybinds,
    getSpeedWidgetDescription,
    getSpeedWidgetDisplayName,
    getSpeedWidgetEditorDisplay,
    renderSpeedWidgetEditor,
    renderSpeedWidgetValue
} from './shared/speed-widget';

export class OutputSpeedWidget implements Widget {
    getDefaultColor(): string { return 'cyan'; }
    getDescription(): string { return getSpeedWidgetDescription('output'); }
    getDisplayName(): string { return getSpeedWidgetDisplayName('output'); }
    getCategory(): string { return 'Token Speed'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getSpeedWidgetEditorDisplay('output', item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        void settings;
        return renderSpeedWidgetValue('output', item, context);
    }

    getCustomKeybinds(): CustomKeybind[] {
        return getSpeedWidgetCustomKeybinds();
    }

    renderEditor(props: WidgetEditorProps) {
        return renderSpeedWidgetEditor(props);
    }

    getValueType(): 'number' { return 'number'; }

    getValue(context: RenderContext, item: WidgetItem): number | string | boolean | null {
        return getValueFromRender(this, context, item, parseSpeed);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
