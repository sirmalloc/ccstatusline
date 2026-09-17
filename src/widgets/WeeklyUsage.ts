import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    HideableState,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

import {
    USAGE_NO_DATA_HIDEABLE_STATE,
    getUsagePercentCustomKeybinds
} from './shared/usage-display';
import {
    getUsagePercentWidgetDescription,
    getUsagePercentWidgetDisplayName,
    getUsagePercentWidgetEditorDisplay,
    handleUsagePercentWidgetEditorAction,
    renderUsagePercentWidgetValue
} from './shared/usage-percent-widget';

export class WeeklyUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return getUsagePercentWidgetDescription('weekly'); }
    getDisplayName(): string { return getUsagePercentWidgetDisplayName('weekly'); }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getUsagePercentWidgetEditorDisplay('weekly', item);
    }

    getHideableStates(): HideableState[] {
        return [USAGE_NO_DATA_HIDEABLE_STATE];
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleUsagePercentWidgetEditorAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderUsagePercentWidgetValue('weekly', item, context, settings);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
