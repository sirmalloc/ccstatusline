import type { WidgetItem } from '../types/Widget';

import { getWidget } from './widgets';

function isCustomColor(value: string | undefined): boolean {
    if (!value) {
        return false;
    }

    return value.startsWith('ansi256:') || value.startsWith('hex:');
}

function isIncompatibleForLevel(value: string | undefined, nextLevel: 0 | 1 | 2 | 3): boolean {
    if (!isCustomColor(value)) {
        return false;
    }

    if (nextLevel === 2) {
        return Boolean(value?.startsWith('hex:'));
    }

    if (nextLevel === 3) {
        return Boolean(value?.startsWith('ansi256:'));
    }

    return true;
}

function resetWidgetForegroundToDefault(widget: WidgetItem, nextWidget: WidgetItem): WidgetItem {
    if (widget.type === 'separator' || widget.type === 'flex-separator') {
        return nextWidget;
    }

    const widgetImpl = getWidget(widget.type);
    if (!widgetImpl) {
        return nextWidget;
    }

    return {
        ...nextWidget,
        color: widgetImpl.getDefaultColor()
    };
}

export function hasCustomWidgetColors(lines: WidgetItem[][]): boolean {
    return lines.some(line => line.some(widget => isCustomColor(widget.color) || isCustomColor(widget.backgroundColor)));
}

export function sanitizeLinesForColorLevel(lines: WidgetItem[][], nextLevel: 0 | 1 | 2 | 3): WidgetItem[][] {
    return lines.map(line => line.map((widget) => {
        let nextWidget: WidgetItem = { ...widget };

        if (isIncompatibleForLevel(widget.color, nextLevel)) {
            nextWidget = resetWidgetForegroundToDefault(widget, nextWidget);
        }

        if (isIncompatibleForLevel(widget.backgroundColor, nextLevel)) {
            nextWidget = {
                ...nextWidget,
                backgroundColor: undefined
            };
        }

        return nextWidget;
    }));
}