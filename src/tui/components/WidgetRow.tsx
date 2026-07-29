import {
    Box,
    Text
} from 'ink';
import React from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type {
    Rule,
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import { applyColors } from '../../utils/colors';
import {
    isPowerlineThemeActive,
    type ThemeChannelColors
} from '../../utils/effective-theme-colors';
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
    /** Feature marker shown after the tags, e.g. the rule count. */
    badge?: string | null;
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

    // Pin state is per widget and per channel, so it belongs on the row rather than in a
    // status line that only ever describes the highlighted widget. Pins do nothing
    // without a theme to override, so the tag only appears when one is active.
    if (isPowerlineThemeActive(settings)) {
        const pinnedChannels = [
            widget.pinColor ? 'fg' : null,
            widget.pinBackgroundColor ? 'bg' : null
        ].filter(channel => channel !== null);

        if (pinnedChannels.length > 0) {
            tags.push(`(${pinnedChannels.join('+')} pinned)`);
        }
    }

    return tags;
}

/**
 * The rule-count badge shown after a row label in both editor modes. Rules are a feature
 * a widget carries rather than a structural marker, so this reads separately from the dim
 * tags and renders in its own colour. Null when the widget has no rules.
 */
export function getWidgetRuleBadge(widget: WidgetItem): string | null {
    const count = widget.rules?.length ?? 0;
    if (count === 0) {
        return null;
    }

    return `[${count} ${count === 1 ? 'rule' : 'rules'}]`;
}

/**
 * The widget a rule effectively renders as: the rule's overrides on top of the widget, the
 * same merge the renderer performs. Lets a rule row be painted through styleWidgetRowLabel.
 */
export function getRuleEffectiveWidget(widget: WidgetItem, rule: Rule): WidgetItem {
    return {
        ...widget,
        ...rule.apply
    };
}

/**
 * Paint a row label with the colour that widget renders in, so both editor modes agree.
 * themeChannels supplies the channels an active theme takes over; the widget's own colour
 * (then the widget's default) fills the rest. A widget whose colours it does not control -
 * a custom command preserving its command output's colours - is left untinted.
 */
export function styleWidgetRowLabel(
    label: string,
    widget: WidgetItem,
    settings: Settings,
    themeChannels?: ThemeChannelColors
): string {
    const isSeparator = widget.type === 'separator' || widget.type === 'flex-separator';
    const widgetImpl = isSeparator ? null : getWidget(widget.type);

    if (widgetImpl && !widgetImpl.supportsColors(widget)) {
        return label;
    }

    return applyColors(
        label,
        themeChannels?.fg ?? widget.color ?? widgetImpl?.getDefaultColor() ?? 'white',
        themeChannels?.bg ?? widget.backgroundColor,
        widget.bold,
        getColorLevelString(settings.colorLevel),
        widget.dim
    );
}

export const WidgetRow: React.FC<WidgetRowProps> = ({
    number,
    label,
    isSelected,
    labelIsStyled = false,
    indicator = '▶',
    selectionColor = 'green',
    modifierText,
    tags = [],
    badge
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
            {badge && (
                <Text color='yellow'>
                    {' '}
                    {badge}
                </Text>
            )}
        </Box>
    );
};
