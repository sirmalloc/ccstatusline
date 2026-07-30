import {
    Box,
    Text
} from 'ink';
import React from 'react';

import { getColorLevelString } from '../../types/ColorLevel';
import type { Settings } from '../../types/Settings';
import type {
    WidgetEditorDisplay,
    WidgetItem
} from '../../types/Widget';
import { applyColors } from '../../utils/colors';
import {
    isPowerlineThemeActive,
    type ThemeChannelColors
} from '../../utils/effective-theme-colors';
import {
    isGradientSpec,
    parseGradientSpec
} from '../../utils/gradient';
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

/** Does this widget render as part of the previous widget's segment? */
export function isMergedIntoPreviousWidget(widgets: WidgetItem[], index: number): boolean {
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
    // status line that only ever describes the highlighted widget. The tag shows whenever a
    // pin is set, including with no theme active: a pin that overrides nothing right now is
    // exactly the one worth surfacing, since it revives the moment a theme is turned on.
    const pinnedChannels = [
        widget.pinColor ? 'fg' : null,
        widget.pinBackgroundColor ? 'bg' : null
    ].filter(channel => channel !== null);

    if (pinnedChannels.length > 0) {
        tags.push(isPowerlineThemeActive(settings)
            ? `(${pinnedChannels.join('+')} pinned)`
            : `(${pinnedChannels.join('+')} pinned, inactive)`);
    }

    return tags;
}

function isOverrideSet(override: string | undefined): override is string {
    return Boolean(override) && override !== 'none';
}

/**
 * Paint a row label with the colour that widget renders in, so both editor modes agree.
 * themeChannels supplies the channels an active theme takes over; the widget's own colour
 * (then the widget's default) fills the rest. A widget whose colours it does not control -
 * a custom command preserving its command output's colours - is left untinted.
 *
 * The renderer's precedence is reproduced in full, because a row that ignores part of it shows
 * a colour the status line will not use - including the parts that only apply to one of the two
 * render paths. globalBold ORs with the widget's own bold in both. The rest differ:
 *
 * - A global background override is read by the standard path only; renderPowerlineStatusLine
 *   never looks at it, so under powerline the theme or the widget keeps the background.
 * - A gradient foreground override is not a solid colour, so neither path assigns it per widget.
 *   It is painted across the finished line, giving each widget a slice - which a single row
 *   cannot know, so the row shows the gradient across its own label instead of claiming one
 *   stop for every row. At ansi16 that pass is a no-op and the widget keeps its own colour.
 * - Under powerline one segment carries one foreground code, so a widget's own gradient
 *   collapses to a single colour - at the color level in use, which is why applyColors is
 *   asked to collapse rather than the stop being derived here.
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

    const colorLevel = getColorLevelString(settings.colorLevel);
    let fgColor: string | undefined = themeChannels?.fg ?? widget.color ?? widgetImpl?.getDefaultColor() ?? 'white';
    let bgColor = themeChannels?.bg ?? widget.backgroundColor;

    let collapseGradient = settings.powerline.enabled;

    const fgOverride = settings.overrideForegroundColor;
    if (isOverrideSet(fgOverride)) {
        // "gradient:" is only a prefix. A spec with too few resolvable stops passes isGradientSpec
        // but parses to null, and the two paths part company there: powerline leaves the widget's
        // own foreground alone, while the standard path has already dropped it and then paints no
        // gradient over it. Both are reproduced, because a row exists to show what will render.
        const overrideStops = parseGradientSpec(fgOverride);
        if (!isGradientSpec(fgOverride)) {
            fgColor = fgOverride;
        } else if (colorLevel !== 'ansi16') {
            if (overrideStops) {
                fgColor = fgOverride;
                collapseGradient = false;
            } else if (!settings.powerline.enabled) {
                fgColor = undefined;
            }
        }
    }

    if (isOverrideSet(settings.overrideBackgroundColor) && !settings.powerline.enabled) {
        bgColor = settings.overrideBackgroundColor;
    }

    return applyColors(
        label,
        fgColor,
        bgColor,
        settings.globalBold || widget.bold,
        colorLevel,
        widget.dim,
        collapseGradient
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
    tags = []
}) => {
    const highlightColor = isSelected ? selectionColor : undefined;

    return (
        <Box flexDirection='row' flexWrap='nowrap'>
            <Box width={3}>
                <Text color={highlightColor}>{isSelected ? `${indicator} ` : '  '}</Text>
            </Box>
            <Text color={highlightColor}>{`${number}. `}</Text>
            {/*
              * A styled label carries its own colours, so the selection colour cannot be
              * applied to it. Underline instead - otherwise a tinted row's only selection cue
              * is the indicator and the row number, which is easy to lose on a coloured band.
              */}
            <Text color={labelIsStyled ? undefined : highlightColor} underline={labelIsStyled && isSelected}>{label}</Text>
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
