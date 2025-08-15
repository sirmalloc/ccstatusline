import chalk from 'chalk';
import {
    Box,
    Text
} from 'ink';
import React from 'react';

import {
    type Settings,
    type WidgetItem
} from '../../utils/config';
import {
    renderStatusLine as renderLine,
    type RenderContext
} from '../../utils/renderer';
import { canDetectTerminalWidth } from '../../utils/terminal';

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
}

const renderSingleLine = (
    widgets: WidgetItem[],
    terminalWidth: number,
    widthDetectionAvailable: boolean,
    settings: Settings,
    lineIndex: number,
    globalSeparatorIndex: number
): string => {
    // Create render context for preview
    const context: RenderContext = {
        terminalWidth,
        isPreview: true,
        lineIndex,
        globalSeparatorIndex
    };

    return renderLine(widgets, settings, context);
};

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings }) => {
    const widthDetectionAvailable = React.useMemo(() => canDetectTerminalWidth(), []);

    // Render each configured line
    // Pass the full terminal width - the renderer will handle preview adjustments
    const renderedLines = React.useMemo(() => {
        if (!settings)
            return [];

        let globalSeparatorIndex = 0;
        const result: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const lineItems = lines[i];
            if (lineItems && lineItems.length > 0) {
                const line = renderSingleLine(lineItems, terminalWidth, widthDetectionAvailable, settings, i, globalSeparatorIndex);
                result.push(line);

                // Count separators used in this line (widgets - 1, excluding merged widgets)
                const nonMergedWidgets = lineItems.filter((_, idx) => idx === lineItems.length - 1 || !lineItems[idx]?.merge);
                if (nonMergedWidgets.length > 1) {
                    globalSeparatorIndex += nonMergedWidgets.length - 1;
                }
            }
        }

        return result;
    }, [lines, terminalWidth, widthDetectionAvailable, settings]);

    return (
        <Box flexDirection='column'>
            <Box borderStyle='round' borderColor='gray' borderDimColor width='100%' paddingLeft={1}>
                <Text>&gt;</Text>
            </Box>
            {renderedLines.map((line, index) => (
                <Text key={index}>
                    {' '}
                    {line}
                    {chalk.reset('')}
                </Text>
            ))}
        </Box>
    );
};