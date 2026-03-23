import chalk from 'chalk';
import {
    Box,
    Text
} from 'ink';
import React from 'react';

import type { RenderContext } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import type { WidgetItem } from '../../types/Widget';
import { advanceGlobalPowerlineThemeIndex } from '../../utils/powerline-theme-index';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLineWithInfo,
    type PreRenderedWidget,
    type RenderResult
} from '../../utils/renderer';
import { advanceGlobalSeparatorIndex } from '../../utils/separator-index';

/**
 * Create mock context data for preview mode that matches widget preview values
 * This ensures rules evaluate correctly in preview
 */
function createPreviewContextData(): RenderContext['data'] {
    return {
        context_window: {
            context_window_size: 200000,
            total_input_tokens: 18600,  // Results in ~9.3% used
            total_output_tokens: 0,
            current_usage: 18600,
            used_percentage: 11.6,  // Matches context-percentage-usable preview
            remaining_percentage: 88.4
        },
        cost: { total_cost_usd: 2.45 }
    };
}

export interface StatusLinePreviewProps {
    lines: WidgetItem[][];
    terminalWidth: number;
    settings?: Settings;
    onTruncationChange?: (isTruncated: boolean) => void;
}

const renderSingleLine = (
    widgets: WidgetItem[],
    terminalWidth: number,
    settings: Settings,
    lineIndex: number,
    globalSeparatorIndex: number,
    globalPowerlineThemeIndex: number,
    preRenderedWidgets: PreRenderedWidget[],
    preCalculatedMaxWidths: number[]
): RenderResult => {
    // Create render context for preview with mock data for rules evaluation
    const context: RenderContext = {
        data: createPreviewContextData(),
        terminalWidth,
        isPreview: true,
        minimalist: settings.minimalistMode,
        lineIndex,
        globalSeparatorIndex,
        globalPowerlineThemeIndex,
        gitData: {
            changedFiles: 3,
            insertions: 42,
            deletions: 18
        }
    };

    return renderStatusLineWithInfo(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
};

export const StatusLinePreview: React.FC<StatusLinePreviewProps> = ({ lines, terminalWidth, settings, onTruncationChange }) => {
    // Render each configured line
    // Pass the full terminal width - the renderer will handle preview adjustments
    const { renderedLines, anyTruncated } = React.useMemo(() => {
        if (!settings)
            return { renderedLines: [], anyTruncated: false };

        // Always pre-render all widgets once (for efficiency)
        // Include mock data for rules evaluation in preview
        const previewContext: RenderContext = {
            data: createPreviewContextData(),
            terminalWidth,
            isPreview: true,
            minimalist: settings.minimalistMode,
            gitData: {
                changedFiles: 3,
                insertions: 42,
                deletions: 18
            }
        };
        const preRenderedLines = preRenderAllWidgets(lines, settings, previewContext);
        const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

        let globalSeparatorIndex = 0;
        let globalPowerlineThemeIndex = 0;
        const result: string[] = [];
        let truncated = false;

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
                    preRenderedWidgets,
                    preCalculatedMaxWidths
                );
                result.push(renderResult.line);
                if (renderResult.wasTruncated) {
                    truncated = true;
                }

                globalSeparatorIndex = advanceGlobalSeparatorIndex(globalSeparatorIndex, lineItems);
                if (settings.powerline.enabled && settings.powerline.continueThemeAcrossLines) {
                    globalPowerlineThemeIndex = advanceGlobalPowerlineThemeIndex(globalPowerlineThemeIndex, preRenderedWidgets);
                }
            }
        }

        return { renderedLines: result, anyTruncated: truncated };
    }, [lines, terminalWidth, settings]);

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