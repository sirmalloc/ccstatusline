import type {
    WidgetItem,
    WidgetItemType
} from '../../../types/Widget';
import { clearLabel } from '../../../widgets/shared/raw-or-labeled';

import type { WidgetPickerAction } from './input-handlers';

export interface PickerPlacement {
    widgets: WidgetItem[];
    selectedIndex: number;
}

export function getPickerInsertIndex(action: WidgetPickerAction, widgetCount: number, selectedIndex: number): number {
    if (action === 'add') {
        return widgetCount > 0 ? selectedIndex + 1 : 0;
    }

    return selectedIndex;
}

// Shared by the live picker preview and the final selection so the line the
// preview shows is exactly the line Enter produces
export function placePickerSelection(
    widgets: WidgetItem[],
    action: WidgetPickerAction,
    selectedIndex: number,
    selectedType: WidgetItemType,
    newWidget: Omit<WidgetItem, 'type'>
): PickerPlacement {
    if (action === 'change') {
        const currentWidget = widgets[selectedIndex];
        if (!currentWidget) {
            return { widgets, selectedIndex };
        }

        const newWidgets = [...widgets];
        // Other metadata carries over, but a label names the old widget's value
        newWidgets[selectedIndex] = currentWidget.type === selectedType
            ? currentWidget
            : { ...clearLabel(currentWidget), type: selectedType };
        return { widgets: newWidgets, selectedIndex };
    }

    const insertIndex = getPickerInsertIndex(action, widgets.length, selectedIndex);
    const newWidgets = [...widgets];
    newWidgets.splice(insertIndex, 0, { ...newWidget, type: selectedType });
    return { widgets: newWidgets, selectedIndex: insertIndex };
}
