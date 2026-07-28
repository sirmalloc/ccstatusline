import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type { Settings } from '../../types/Settings';
import type {
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import { getWidget } from '../../utils/widgets';

export interface WidgetRowProps {
    /** 1-based position of the widget in its line. */
    number: number;
    /** Row label. May already carry ANSI codes - set labelIsStyled when it does. */
    label: string;
    isSelected: boolean;
    /** Skips the selection colour on the label so pre-applied ANSI codes survive. */
    labelIsStyled?: boolean;
    indicator?: string;
    selectionColor?: string;
    modifierText?: string;
    tags?: string[];
}

function isMergedIntoPreviousWidget(widgets: WidgetItem[], index: number): boolean {
    if (index <= 0) {
        return false;
    }

    return Boolean(widgets[index - 1]?.merge);
}

/** The label both editor modes show for a widget, so a row reads the same in each. */
export function getWidgetRowLabel(widget: WidgetItem): WidgetEditorDisplay {
    if (widget.type === 'separator') {
        const char = widget.character ?? '|';
        return { displayText: `Separator ${char === ' ' ? '(space)' : char}` };
    }

    if (widget.type === 'flex-separator') {
        return { displayText: 'Flex Separator' };
    }

    const widgetImpl = getWidget(widget.type);
    if (!widgetImpl) {
        return { displayText: `Unknown: ${widget.type}` };
    }

    const { displayText, modifierText } = widgetImpl.getEditorDisplay(widget);
    return {
        displayText: displayText || widgetImpl.getDisplayName(),
        modifierText
    };
}

/** The dim structure markers shown after a row label in both editor modes. */
export function getWidgetRowTags(widgets: WidgetItem[], index: number, settings: Settings): string[] {
    const widget = widgets[index];
    if (!widget) {
        return [];
    }

    const widgetImpl = widget.type !== 'separator' && widget.type !== 'flex-separator'
        ? getWidget(widget.type)
        : null;
    const tags: string[] = [];

    if (widget.rawValue && widgetImpl?.supportsRawValue()) {
        tags.push('(raw value)');
    }

    if (widget.merge === true) {
        tags.push('(merged→)');
    }

    if (widget.merge === 'no-padding') {
        tags.push('(merged-no-pad→)');
    }

    if (widget.excludeFromAutoAlign
        && settings.powerline.enabled
        && settings.powerline.autoAlign
        && !isMergedIntoPreviousWidget(widgets, index)) {
        tags.push('(no-align)');
    }

    return tags;
}

export const WidgetRow: React.FC<WidgetRowProps> = ({
    number,
    label,
    isSelected,
    labelIsStyled = false,
    indicator = '▶',
    selectionColor = 'green',
    modifierText,
    tags = []
}) => {
    const highlightColor = isSelected ? selectionColor : undefined;

    return (
        <Box flexDirection='row' flexWrap='nowrap'>
            <Box width={3}>
                <Text color={highlightColor}>{isSelected ? `${indicator} ` : '  '}</Text>
            </Box>
            <Text color={highlightColor}>{`${number}. `}</Text>
            <Text color={labelIsStyled ? undefined : highlightColor}>{label}</Text>
            {modifierText && (
                <Text dimColor>
                    {' '}
                    {modifierText}
                </Text>
            )}
            {tags.map(tag => (
                <Text key={tag} dimColor>
                    {' '}
                    {tag}
                </Text>
            ))}
        </Box>
    );
};
