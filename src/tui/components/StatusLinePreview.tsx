import chalk from 'chalk';
import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    getVisibleWidth,
    truncateStyledText
} from '../../utils/ansi';
import { advanceGlobalPowerlineThemeIndex } from '../../utils/powerline-theme-index';
import {
    calculateMaxWidthsFromPreRendered,
    countPowerlineStartCapSlots,
    preRenderAllWidgets,
    renderStatusLineWithInfo,
    type PreRenderedWidget,
    type RenderResult
} from '../../utils/renderer';
import { advanceGlobalSeparatorIndex } from '../../utils/separator-index';
import { sanitizeTerminalText } from '../../utils/terminal-sanitize';

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
}

const renderSingleLine = (
    widgets: WidgetItem[],
    terminalWidth: number,
    settings: Settings,
    lineIndex: number,
    globalSeparatorIndex: number,
    globalPowerlineThemeIndex: number,
    globalPowerlineStartCapIndex: number,
    preRenderedWidgets: PreRenderedWidget[],
    preCalculatedMaxWidths: number[]
): RenderResult => {
    // Create render context for preview
    const context: RenderContext = {
        terminalWidth,
        isPreview: true,
        minimalist: settings.minimalistMode,
        gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
        customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds,
        lineIndex,
        globalSeparatorIndex,
        globalPowerlineThemeIndex,
        globalPowerlineStartCapIndex
    };

    return renderStatusLineWithInfo(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
};

const PREVIEW_LINE_INDENT = '  ';

export function preparePreviewLineForTerminal(line: string, terminalWidth: number): string {
    // Ink's ANSI tokenizer recognizes BEL-terminated hyperlinks, but not ST.
    // After sanitizing, string terminators can only belong to OSC 8 links.
    const printableLine = sanitizeTerminalText(line).replace(/\x1b\\/g, '\x07');
    const availableWidth = Math.max(0, terminalWidth - getVisibleWidth(PREVIEW_LINE_INDENT));
    return truncateStyledText(printableLine, availableWidth, { ellipsis: true });
}

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings }) => {
    // Render each configured line
    // Pass the full terminal width - the renderer will handle preview adjustments
    const renderedLines = React.useMemo(() => {
        if (!settings)
            return [];

        // Always pre-render all widgets once (for efficiency)
        const preRenderedLines = preRenderAllWidgets(lines, settings, {
            terminalWidth,
            isPreview: true,
            minimalist: settings.minimalistMode,
            gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
            customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds
        });
        const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

        let globalSeparatorIndex = 0;
        let globalPowerlineThemeIndex = 0;
        let globalPowerlineStartCapIndex = 0;
        const result: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const lineItems = lines[i];
            if (lineItems && lineItems.length > 0) {
                const preRenderedWidgets = preRenderedLines[i] ?? [];
                const renderResult = renderSingleLine(
                    lineItems,
                    terminalWidth,
                    settings,
                    i,
                    globalSeparatorIndex,
                    globalPowerlineThemeIndex,
                    globalPowerlineStartCapIndex,
                    preRenderedWidgets,
                    preCalculatedMaxWidths
                );
                result.push(renderResult.line);

                globalSeparatorIndex = advanceGlobalSeparatorIndex(globalSeparatorIndex, lineItems, preRenderedWidgets);
                if (settings.powerline.enabled) {
                    globalPowerlineStartCapIndex += countPowerlineStartCapSlots(lineItems, preRenderedWidgets);
                }
                if (settings.powerline.enabled && settings.powerline.continueThemeAcrossLines) {
                    globalPowerlineThemeIndex = advanceGlobalPowerlineThemeIndex(globalPowerlineThemeIndex, preRenderedWidgets);
                }
            }
        }

        return result;
    }, [lines, terminalWidth, settings]);

    return (
        <Box flexDirection='column'>
            <Box borderStyle='round' borderColor='gray' borderDimColor width='100%' paddingLeft={1}>
                <Text>
                    &gt;
                    <Text dimColor> Preview  (ctrl+s to save configuration at any time)</Text>
                </Text>
            </Box>
            {renderedLines.map((line, index) => (
                <Text key={index} wrap='truncate'>
                    {PREVIEW_LINE_INDENT}
                    {preparePreviewLineForTerminal(line, terminalWidth)}
                    {chalk.reset('')}
                </Text>
            ))}
        </Box>
    );
};
