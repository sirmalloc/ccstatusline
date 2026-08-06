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

export class WeeklyOpusUsageWidget implements Widget {
    getDefaultColor(): string { return 'brightBlue'; }
    getDescription(): string { return getUsagePercentWidgetDescription('weekly-opus'); }
    getDisplayName(): string { return getUsagePercentWidgetDisplayName('weekly-opus'); }
    getCategory(): string { return 'Usage'; }

    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return getUsagePercentWidgetEditorDisplay('weekly-opus', item);
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        return handleUsagePercentWidgetEditorAction(action, item);
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        return renderUsagePercentWidgetValue('weekly-opus', item, context, settings);
    }

    getCustomKeybinds(item?: WidgetItem): CustomKeybind[] {
        return getUsagePercentCustomKeybinds(item);
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
    supportsNumberFormat(): boolean { return true; }
}
