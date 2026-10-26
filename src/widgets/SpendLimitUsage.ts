import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import { getUsagePercentCustomKeybinds } from './shared/usage-display';
import {
    getUsagePercentWidgetDescription,
    getUsagePercentWidgetDisplayName,
    getUsagePercentWidgetEditorDisplay,
    getUsagePercentWidgetLabel,
    handleUsagePercentWidgetEditorAction,
    renderUsagePercentWidgetValue
} from './shared/usage-percent-widget';

export class SpendLimitUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightMagenta'; }
    getDescription(): string { return getUsagePercentWidgetDescription('spend-limit'); }
    getDisplayName(): string { return getUsagePercentWidgetDisplayName('spend-limit'); }
    getCategory(): string { return 'Usage'; }
    getLabelPrefix(): string { return getUsagePercentWidgetLabel('spend-limit'); }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getUsagePercentWidgetEditorDisplay('spend-limit', item);
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleUsagePercentWidgetEditorAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderUsagePercentWidgetValue('spend-limit', item, context, settings);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item, false);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
