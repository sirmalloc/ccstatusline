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
import { canDetectTerminalWidth } from '../utils/terminal';

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
}

const renderSingleLine = (widgets: WidgetItem[], terminalWidth: number, widthDetectionAvailable: boolean, settings: Settings): string => {
    // Create render context for preview
    const context: RenderContext = {
        terminalWidth,
        isPreview: true
    };

    return renderLine(widgets, settings, context);
};

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings }) => {
    const widthDetectionAvailable = React.useMemo(() => canDetectTerminalWidth(), []);

    // Render each configured line
    // Pass the full terminal width - the renderer will handle preview adjustments
    const renderedLines = React.useMemo(() => settings ? lines.map(lineItems => lineItems.length > 0 ? renderSingleLine(lineItems, terminalWidth, widthDetectionAvailable, settings) : ''
    ).filter(line => line !== '') : [], // Remove empty lines
    [lines, terminalWidth, widthDetectionAvailable, settings]);

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