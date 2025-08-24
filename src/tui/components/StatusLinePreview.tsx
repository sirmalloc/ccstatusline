import chalk from 'chalk';
import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import {
    renderStatusLineWithInfo,
    type RenderContext,
    type RenderResult
} from '../../utils/renderer';
import { canDetectTerminalWidth } from '../../utils/terminal';

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
    onTruncationChange?: (isTruncated: boolean) => void;
}

const renderSingleLine = (
    widgets: WidgetItem[],
    terminalWidth: number,
    widthDetectionAvailable: boolean,
    settings: Settings,
    lineIndex: number,
    globalSeparatorIndex: number,
    allLinesWidgets?: WidgetItem[][]
): RenderResult => {
    // Create render context for preview
    const context: RenderContext = {
        terminalWidth,
        isPreview: true,
        lineIndex,
        globalSeparatorIndex
    };

    return renderStatusLineWithInfo(widgets, settings, context, allLinesWidgets);
};

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings, onTruncationChange }) => {
    const widthDetectionAvailable = React.useMemo(() => canDetectTerminalWidth(), []);

    // Render each configured line
    // Pass the full terminal width - the renderer will handle preview adjustments
    const { renderedLines, anyTruncated } = React.useMemo(() => {
        if (!settings)
            return { renderedLines: [], anyTruncated: false };

        // Check if powerline mode is enabled and autoAlign is on
        const isPowerlineMode = settings.powerline.enabled;
        const autoAlign = settings.powerline.autoAlign;
        const allLinesWidgets = (isPowerlineMode && autoAlign) ? lines : undefined;

        let globalSeparatorIndex = 0;
        const result: string[] = [];
        let truncated = false;

        for (let i = 0; i < lines.length; i++) {
            const lineItems = lines[i];
            if (lineItems && lineItems.length > 0) {
                const renderResult = renderSingleLine(lineItems, terminalWidth, widthDetectionAvailable, settings, i, globalSeparatorIndex, allLinesWidgets);
                result.push(renderResult.line);
                if (renderResult.wasTruncated) {
                    truncated = true;
                }

                // Count separators used in this line (widgets - 1, excluding merged widgets)
                const nonMergedWidgets = lineItems.filter((_, idx) => idx === lineItems.length - 1 || !lineItems[idx]?.merge);
                if (nonMergedWidgets.length > 1) {
                    globalSeparatorIndex += nonMergedWidgets.length - 1;
                }
            }
        }

        return { renderedLines: result, anyTruncated: truncated };
    }, [lines, terminalWidth, widthDetectionAvailable, settings]);

    // Notify parent when truncation status changes
    React.useEffect(() => {
        onTruncationChange?.(anyTruncated);
    }, [anyTruncated, onTruncationChange]);

    return (
        <Box flexDirection='column'>
            <Box borderStyle='round' borderColor='gray' borderDimColor width='100%' paddingLeft={1}>
                <Text>
                    &gt;
                    <Text dimColor> Preview  (ctrl+s to save configuration at any time)</Text>
                </Text>
            </Box>
            {renderedLines.map((line, index) => (
                <Text key={index}>
                    {'  '}
                    {line}
                    {chalk.reset('')}
                </Text>
            ))}
        </Box>
    );
};