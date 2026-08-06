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
    handleUsagePercentWidgetEditorAction,
    renderUsagePercentWidgetValue
} from './shared/usage-percent-widget';

export class FableWeeklyUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return getUsagePercentWidgetDescription('fable-weekly'); }
    getDisplayName(): string { return getUsagePercentWidgetDisplayName('fable-weekly'); }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getUsagePercentWidgetEditorDisplay('fable-weekly', item);
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleUsagePercentWidgetEditorAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderUsagePercentWidgetValue('fable-weekly', item, context, settings);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
