import chalk from 'chalk';
import stringWidth from 'string-width';

// ANSI escape sequence for stripping color codes
const ANSI_REGEX = new RegExp(`\\x1b\\[[0-9;]*m`, 'g');

import type {
    RenderContext,
    WidgetItem
} from '../types';
import { getColorLevelString } from '../types/ColorLevel';
import type { Settings } from '../types/Settings';

import {
    applyColors,
    bgToFg,
    getColorAnsiCode,
    getPowerlineTheme
} from './colors';
import { getTerminalWidth } from './terminal';
import { getWidget } from './widgets';

// Helper function to format token counts
export function formatTokens(count: number): string {
    if (count >= 1000000)
        return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000)
        return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
}

function renderPowerlineStatusLine(
    widgets: WidgetItem[],
    settings: Settings,
    context: RenderContext,
    lineIndex = 0,  // Which line we're rendering (for theme color cycling)
    globalSeparatorOffset = 0,  // Starting separator index for this line
    preRenderedWidgets: PreRenderedWidget[],  // Pre-rendered widgets for this line
    preCalculatedMaxWidths: number[]  // Pre-calculated max widths for alignment
): string {
    const powerlineConfig = settings.powerline as Record<string, unknown> | undefined;
    const config = powerlineConfig ?? {};

    // Get separator configuration
    const separators = (config.separators as string[] | undefined) ?? ['\uE0B0'];
    const invertBgs = (config.separatorInvertBackground as boolean[] | undefined) ?? separators.map(() => false);

    // Get caps arrays or fallback to empty arrays
    const startCaps = (config.startCaps as string[] | undefined) ?? [];
    const endCaps = (config.endCaps as string[] | undefined) ?? [];

    // Get the cap for this line (cycle through if more lines than caps)
    const capLineIndex = context.lineIndex ?? lineIndex;
    const startCap = startCaps.length > 0 ? startCaps[capLineIndex % startCaps.length] : '';
    const endCap = endCaps.length > 0 ? endCaps[capLineIndex % endCaps.length] : '';

    // Get theme colors if a theme is set and not 'custom'
    const themeName = config.theme as string | undefined;
    let themeColors: { fg: string[]; bg: string[] } | undefined;

    if (themeName && themeName !== 'custom') {
        const theme = getPowerlineTheme(themeName);
        if (theme) {
            const colorLevel = getColorLevelString((settings.colorLevel as number) as (0 | 1 | 2 | 3));
            const colorLevelKey = colorLevel === 'ansi16' ? '1' : colorLevel === 'ansi256' ? '2' : '3';
            themeColors = theme[colorLevelKey];
        }
    }

    // Get color level from settings
    const colorLevel = getColorLevelString((settings.colorLevel as number) as (0 | 1 | 2 | 3));

    // Filter out separator and flex-separator widgets in powerline mode
    const filteredWidgets = widgets.filter(widget => widget.type !== 'separator' && widget.type !== 'flex-separator'
    );

    if (filteredWidgets.length === 0)
        return '';

    const detectedWidth = context.terminalWidth ?? getTerminalWidth();

    // Calculate terminal width based on flex mode settings
    let terminalWidth: number | null = null;
    if (detectedWidth) {
        const flexMode = settings.flexMode as string;

        if (context.isPreview) {
            // In preview mode, account for box borders and padding (6 chars total)
            if (flexMode === 'full') {
                terminalWidth = detectedWidth - 6;
            } else if (flexMode === 'full-minus-40') {
                terminalWidth = detectedWidth - 40;
            } else if (flexMode === 'full-until-compact') {
                terminalWidth = detectedWidth - 6;
            }
        } else {
            // In actual rendering mode
            if (flexMode === 'full') {
                terminalWidth = detectedWidth - 6;
            } else if (flexMode === 'full-minus-40') {
                terminalWidth = detectedWidth - 40;
            } else if (flexMode === 'full-until-compact') {
                const threshold = settings.compactThreshold;
                const contextPercentage = context.tokenMetrics
                    ? Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100) : 0;

                if (contextPercentage >= threshold) {
                    terminalWidth = detectedWidth - 40;
                } else {
                    terminalWidth = detectedWidth - 6;
                }
            }
        }
    }

    // Build widget elements (similar to regular mode but without separators)
    const widgetElements: { content: string; bgColor?: string; fgColor?: string; widget: WidgetItem }[] = [];
    let widgetColorIndex = 0;  // Track widget index for theme colors

    // Create a mapping from filteredWidgets to preRenderedWidgets indices
    // This is needed because filteredWidgets excludes separators but preRenderedWidgets includes all widgets
    const preRenderedIndices: number[] = [];
    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (widget && widget.type !== 'separator' && widget.type !== 'flex-separator') {
            preRenderedIndices.push(i);
        }
    }

    for (let i = 0; i < filteredWidgets.length; i++) {
        const widget = filteredWidgets[i];
        if (!widget)
            continue;
        let widgetText = '';
        let defaultColor = 'white';

        // Handle separators specially (they're not widgets)
        if (widget.type === 'separator' || widget.type === 'flex-separator') {
            // These are filtered out in powerline mode
            continue;
        }

        // Use pre-rendered content - use the correct index from the mapping
        const actualPreRenderedIndex = preRenderedIndices[i];
        const preRendered = actualPreRenderedIndex !== undefined ? preRenderedWidgets[actualPreRenderedIndex] : undefined;
        if (preRendered?.content) {
            widgetText = preRendered.content;
            // Get default color from widget impl for consistency
            const widgetImpl = getWidget(widget.type);
            if (widgetImpl) {
                defaultColor = widgetImpl.getDefaultColor();
            }
        }

        if (widgetText) {
            // Apply default padding from settings
            const padding = settings.defaultPadding ?? '';

            // If override FG color is set and this is a custom command with preserveColors,
            // we need to strip the ANSI codes from the widget text
            if (settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none'
                && widget.type === 'custom-command' && widget.preserveColors) {
                // Strip ANSI color codes when override is active
                widgetText = widgetText.replace(ANSI_REGEX, '');
            }

            // Check if padding should be omitted due to no-padding merge
            const prevItem = i > 0 ? filteredWidgets[i - 1] : null;
            const nextItem = i < filteredWidgets.length - 1 ? filteredWidgets[i + 1] : null;
            const omitLeadingPadding = prevItem?.merge === 'no-padding';
            const omitTrailingPadding = widget.merge === 'no-padding' && nextItem;

            const leadingPadding = omitLeadingPadding ? '' : padding;
            const trailingPadding = omitTrailingPadding ? '' : padding;
            const paddedText = `${leadingPadding}${widgetText}${trailingPadding}`;

            // Determine colors
            let fgColor = widget.color ?? defaultColor;
            let bgColor = widget.backgroundColor;

            // Apply theme colors if a theme is set (and not 'custom')
            // For custom commands with preserveColors, only skip foreground theme colors
            const skipFgTheme = widget.type === 'custom-command' && widget.preserveColors;

            if (themeColors) {
                if (!skipFgTheme) {
                    fgColor = themeColors.fg[widgetColorIndex % themeColors.fg.length] ?? fgColor;
                }
                bgColor = themeColors.bg[widgetColorIndex % themeColors.bg.length] ?? bgColor;

                // Only increment color index if this widget is not merged with the next one
                // This ensures merged widgets share the same color
                if (!widget.merge) {
                    widgetColorIndex++;
                }
            }

            // Apply override FG color if set (overrides theme)
            if (settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none') {
                fgColor = settings.overrideForegroundColor;
            }

            widgetElements.push({
                content: paddedText,
                bgColor: bgColor ?? undefined,  // Make sure undefined, not empty string
                fgColor: fgColor,
                widget: widget
            });
        }
    }

    if (widgetElements.length === 0)
        return '';

    // Apply auto-alignment if enabled
    const autoAlign = config.autoAlign as boolean | undefined;
    if (autoAlign) {
        // Apply padding to current line's widgets based on pre-calculated max widths
        let alignmentPos = 0;
        for (let i = 0; i < widgetElements.length; i++) {
            const element = widgetElements[i];
            if (!element)
                continue;

            // Check if previous widget was merged with this one
            const prevWidget = i > 0 ? widgetElements[i - 1] : null;
            const isPreviousMerged = prevWidget?.widget.merge;

            // Only apply alignment to non-merged widgets (widgets that follow a merge are excluded)
            if (!isPreviousMerged) {
                const maxWidth = preCalculatedMaxWidths[alignmentPos];
                if (maxWidth !== undefined) {
                    // Calculate combined width if this widget merges with following ones
                    let combinedLength = stringWidth(element.content.replace(ANSI_REGEX, ''));
                    let j = i;
                    while (j < widgetElements.length - 1 && widgetElements[j]?.widget.merge) {
                        j++;
                        const nextElement = widgetElements[j];
                        if (nextElement) {
                            combinedLength += stringWidth(nextElement.content.replace(ANSI_REGEX, ''));
                        }
                    }

                    const paddingNeeded = maxWidth - combinedLength;
                    if (paddingNeeded > 0) {
                        // Add padding to the last widget in the merge group
                        const lastElement = widgetElements[j];
                        if (lastElement) {
                            lastElement.content += ' '.repeat(paddingNeeded);
                        }
                    }

                    // Skip over merged widgets
                    i = j;
                }
                alignmentPos++;
            }
        }
    }

    // Build the final powerline string
    let result = '';

    // Add start cap if specified
    if (startCap && widgetElements.length > 0) {
        const firstWidget = widgetElements[0];
        if (firstWidget?.bgColor) {
            // Start cap uses first widget's background as foreground (converted)
            const capFg = bgToFg(firstWidget.bgColor);
            const fgCode = getColorAnsiCode(capFg, colorLevel, false);
            result += fgCode + startCap + '\x1b[39m';
        } else {
            result += startCap;
        }
    }

    // Render widgets with powerline separators
    for (let i = 0; i < widgetElements.length; i++) {
        const widget = widgetElements[i];
        const nextWidget = widgetElements[i + 1];

        if (!widget)
            continue;

        // Apply colors to widget content using raw ANSI codes for powerline mode
        // This avoids reset codes that interfere with separator rendering
        const shouldBold = (settings.globalBold) || widget.widget.bold;

        // Check if we need a separator after this widget
        const needsSeparator = i < widgetElements.length - 1 && separators.length > 0 && nextWidget && !widget.widget.merge;

        let widgetContent = '';

        // For custom commands with preserveColors, only skip foreground color/bold
        const isPreserveColors = widget.widget.type === 'custom-command' && widget.widget.preserveColors;

        if (shouldBold && !isPreserveColors) {
            widgetContent += '\x1b[1m';
        }
        if (widget.fgColor && !isPreserveColors) {
            widgetContent += getColorAnsiCode(widget.fgColor, colorLevel, false);
        }
        // Always apply background for consistency in powerline mode
        if (widget.bgColor) {
            widgetContent += getColorAnsiCode(widget.bgColor, colorLevel, true);
        }
        widgetContent += widget.content;
        // Reset colors after content
        // For custom commands with preserveColors, also reset text attributes like dim
        if (isPreserveColors) {
            // Full reset to clear any attributes from command (including dim from Claude Code)
            widgetContent += '\x1b[0m';
        } else {
            widgetContent += '\x1b[49m\x1b[39m';
            // Only reset bold if there's no separator following AND no end cap
            const isLastWidget = i === widgetElements.length - 1;
            const hasEndCap = endCaps.length > 0 && endCaps[capLineIndex % endCaps.length];
            if (shouldBold && !needsSeparator && !(isLastWidget && hasEndCap)) {
                widgetContent += '\x1b[22m';
            }
        }

        result += widgetContent;

        // Add separator between widgets (not after last one, and not if current widget is merged with next)
        if (needsSeparator) {
            // Determine which separator to use based on global position
            // Use separators in order, using the last one for all remaining positions
            const globalIndex = globalSeparatorOffset + i;
            const separatorIndex = Math.min(globalIndex, separators.length - 1);
            const separator = separators[separatorIndex] ?? '\uE0B0';
            const shouldInvert = invertBgs[separatorIndex] ?? false;

            // Powerline separator coloring:
            // Normal (not inverted):
            //   - Foreground: previous widget's background color (converted to fg)
            //   - Background: next widget's background color
            // Inverted:
            //   - Foreground: next widget's background color (converted to fg)
            //   - Background: previous widget's background color

            // Build separator with raw ANSI codes to avoid reset issues
            let separatorOutput = '';

            // Check if adjacent widgets have the same background color
            const sameBackground = widget.bgColor && nextWidget.bgColor && widget.bgColor === nextWidget.bgColor;

            if (shouldInvert) {
                // Inverted: swap fg/bg logic
                if (widget.bgColor && nextWidget.bgColor) {
                    if (sameBackground) {
                        // Same background: use next widget's foreground color
                        const fgColor = nextWidget.fgColor;
                        const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                        const bgCode = getColorAnsiCode(widget.bgColor, colorLevel, true);
                        separatorOutput = fgCode + bgCode + separator + '\x1b[39m\x1b[49m';
                    } else {
                        // Different backgrounds: use standard inverted logic
                        const fgColor = bgToFg(nextWidget.bgColor);
                        const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                        const bgCode = getColorAnsiCode(widget.bgColor, colorLevel, true);
                        separatorOutput = fgCode + bgCode + separator + '\x1b[39m\x1b[49m';
                    }
                } else if (widget.bgColor && !nextWidget.bgColor) {
                    const fgColor = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + '\x1b[39m';
                } else if (!widget.bgColor && nextWidget.bgColor) {
                    const fgColor = bgToFg(nextWidget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + '\x1b[39m';
                } else {
                    separatorOutput = separator;
                }
            } else {
                // Normal (not inverted)
                if (widget.bgColor && nextWidget.bgColor) {
                    if (sameBackground) {
                        // Same background: use previous widget's foreground color
                        const fgColor = widget.fgColor;
                        const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                        const bgCode = getColorAnsiCode(nextWidget.bgColor, colorLevel, true);
                        separatorOutput = fgCode + bgCode + separator + '\x1b[39m\x1b[49m';
                    } else {
                        // Different backgrounds: use standard logic
                        const fgColor = bgToFg(widget.bgColor);
                        const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                        const bgCode = getColorAnsiCode(nextWidget.bgColor, colorLevel, true);
                        separatorOutput = fgCode + bgCode + separator + '\x1b[39m\x1b[49m';
                    }
                } else if (widget.bgColor && !nextWidget.bgColor) {
                    // Only previous widget has background
                    const fgColor = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + '\x1b[39m';
                } else if (!widget.bgColor && nextWidget.bgColor) {
                    // Only next widget has background
                    const fgColor = bgToFg(nextWidget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + '\x1b[39m';
                } else {
                    // Neither has background
                    separatorOutput = separator;
                }
            }

            result += separatorOutput;

            // Reset bold after separator if it was set
            if (shouldBold) {
                result += '\x1b[22m';
            }
        }
    }

    // Add end cap if specified
    if (endCap && widgetElements.length > 0) {
        const lastWidget = widgetElements[widgetElements.length - 1];

        if (lastWidget?.bgColor) {
            // End cap uses last widget's background as foreground (converted)
            const capFg = bgToFg(lastWidget.bgColor);
            const fgCode = getColorAnsiCode(capFg, colorLevel, false);
            result += fgCode + endCap + '\x1b[39m';
        } else {
            result += endCap;
        }

        // Reset bold after end cap if needed
        const lastWidgetBold = (settings.globalBold) || lastWidget?.widget.bold;
        if (lastWidgetBold) {
            result += '\x1b[22m';
        }
    }

    // Reset colors at the end
    result += chalk.reset('');

    // Handle truncation if terminal width is known
    if (terminalWidth && terminalWidth > 0) {
        const plainLength = result.replace(ANSI_REGEX, '').length;
        if (plainLength > terminalWidth) {
            // Truncate to terminal width
            let truncated = '';
            let currentLength = 0;
            let inAnsiCode = false;

            for (const char of result) {
                if (char === '\x1b') {
                    inAnsiCode = true;
                    truncated += char;
                } else if (inAnsiCode) {
                    truncated += char;
                    if (char === 'm') {
                        inAnsiCode = false;
                    }
                } else {
                    if (currentLength < terminalWidth - 3) {
                        truncated += char;
                        currentLength++;
                    } else {
                        truncated += '...';
                        break;
                    }
                }
            }
            result = truncated;
        }
    }

    return result;
}

// Format separator with appropriate spacing
function formatSeparator(sep: string): string {
    if (sep === '|') {
        return ' | ';
    } else if (sep === ' ') {
        return ' ';
    } else if (sep === ',') {
        return ', ';
    } else if (sep === '-') {
        return ' - ';
    }
    return sep;
}

export interface RenderResult {
    line: string;
    wasTruncated: boolean;
}

export interface PreRenderedWidget {
    content: string;      // The rendered widget text (without padding)
    plainLength: number;  // Length without ANSI codes
    widget: WidgetItem;   // Original widget config
}

// Pre-render all widgets once and cache the results
export function preRenderAllWidgets(
    allLinesWidgets: WidgetItem[][],
    settings: Settings,
    context: RenderContext
): PreRenderedWidget[][] {
    const preRenderedLines: PreRenderedWidget[][] = [];

    // Process each line
    for (const lineWidgets of allLinesWidgets) {
        const preRenderedLine: PreRenderedWidget[] = [];

        for (const widget of lineWidgets) {
            // Skip separators as they're handled differently
            if (widget.type === 'separator' || widget.type === 'flex-separator') {
                preRenderedLine.push({
                    content: '',  // Separators are handled specially
                    plainLength: 0,
                    widget
                });
                continue;
            }

            const widgetImpl = getWidget(widget.type);
            if (!widgetImpl) {
                // Unknown widget type - skip it entirely
                continue;
            }

            const widgetText = widgetImpl.render(widget, context, settings) ?? '';

            // Store the rendered content without padding (padding is applied later)
            // Use stringWidth to properly calculate Unicode character display width
            const plainLength = stringWidth(widgetText.replace(ANSI_REGEX, ''));
            preRenderedLine.push({
                content: widgetText,
                plainLength,
                widget
            });
        }

        preRenderedLines.push(preRenderedLine);
    }

    return preRenderedLines;
}

// Calculate max widths from pre-rendered widgets for alignment
export function calculateMaxWidthsFromPreRendered(
    preRenderedLines: PreRenderedWidget[][],
    settings: Settings
): number[] {
    const maxWidths: number[] = [];
    const defaultPadding = settings.defaultPadding ?? '';
    const paddingLength = defaultPadding.length;

    for (const preRenderedLine of preRenderedLines) {
        const filteredWidgets = preRenderedLine.filter(
            w => w.widget.type !== 'separator' && w.widget.type !== 'flex-separator' && w.content
        );

        let alignmentPos = 0;
        for (let i = 0; i < filteredWidgets.length; i++) {
            const widget = filteredWidgets[i];
            if (!widget)
                continue;

            // Calculate the total width for this alignment position
            // If this widget is merged with the next, accumulate their widths
            let totalWidth = widget.plainLength + (paddingLength * 2);

            // Check if this widget merges with the next one(s)
            let j = i;
            while (j < filteredWidgets.length - 1 && filteredWidgets[j]?.widget.merge) {
                j++;
                const nextWidget = filteredWidgets[j];
                if (nextWidget) {
                    // For merged widgets, add width but account for padding adjustments
                    // When merging with 'no-padding', don't count padding between widgets
                    if (filteredWidgets[j - 1]?.widget.merge === 'no-padding') {
                        totalWidth += nextWidget.plainLength;
                    } else {
                        totalWidth += nextWidget.plainLength + (paddingLength * 2);
                    }
                }
            }

            const currentMax = maxWidths[alignmentPos];
            if (currentMax === undefined) {
                maxWidths[alignmentPos] = totalWidth;
            } else {
                maxWidths[alignmentPos] = Math.max(currentMax, totalWidth);
            }

            // Skip over merged widgets since we've already processed them
            i = j;
            alignmentPos++;
        }
    }

    return maxWidths;
}

export function renderStatusLineWithInfo(
    widgets: WidgetItem[],
    settings: Settings,
    context: RenderContext,
    preRenderedWidgets: PreRenderedWidget[],
    preCalculatedMaxWidths: number[]
): RenderResult {
    const line = renderStatusLine(widgets, settings, context, preRenderedWidgets, preCalculatedMaxWidths);
    // Check if line contains the truncation ellipsis
    const wasTruncated = line.includes('...');
    return { line, wasTruncated };
}

export function renderStatusLine(
    widgets: WidgetItem[],
    settings: Settings,
    context: RenderContext,
    preRenderedWidgets: PreRenderedWidget[],
    preCalculatedMaxWidths: number[]
): string {
    // Force 24-bit color for non-preview statusline rendering
    // Chalk level is now set globally in ccstatusline.ts and tui.tsx
    // No need to override here

    // Get color level from settings
    const colorLevel = getColorLevelString((settings.colorLevel as number) as (0 | 1 | 2 | 3));

    // Check if powerline mode is enabled
    const powerlineSettings = settings.powerline as Record<string, unknown> | undefined;
    const isPowerlineMode = Boolean(powerlineSettings?.enabled);

    // If powerline mode is enabled, use powerline renderer
    if (isPowerlineMode)
        return renderPowerlineStatusLine(widgets, settings, context, context.lineIndex ?? 0, context.globalSeparatorIndex ?? 0, preRenderedWidgets, preCalculatedMaxWidths);

    // Helper to apply colors with optional background and bold override
    const applyColorsWithOverride = (text: string, foregroundColor?: string, backgroundColor?: string, bold?: boolean): string => {
        // Override foreground color takes precedence over EVERYTHING, including passed foreground color
        let fgColor = foregroundColor;
        if (settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none') {
            fgColor = settings.overrideForegroundColor;
        }

        // Override background color takes precedence over EVERYTHING, including passed background color
        let bgColor = backgroundColor;
        if (settings.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none') {
            bgColor = settings.overrideBackgroundColor;
        }

        const shouldBold = (settings.globalBold) || bold;
        return applyColors(text, fgColor, bgColor, shouldBold, colorLevel);
    };

    const detectedWidth = context.terminalWidth ?? getTerminalWidth();

    // Calculate terminal width based on flex mode settings
    let terminalWidth: number | null = null;
    if (detectedWidth) {
        const flexMode = settings.flexMode as string;

        if (context.isPreview) {
            // In preview mode, account for box borders and padding (6 chars total)
            if (flexMode === 'full') {
                terminalWidth = detectedWidth - 6; // Subtract 6 for box borders and padding in preview
            } else if (flexMode === 'full-minus-40') {
                terminalWidth = detectedWidth - 40; // -40 for auto-compact + 3 for preview
            } else if (flexMode === 'full-until-compact') {
                // For preview, always show full width minus preview padding
                terminalWidth = detectedWidth - 6;
            }
        } else {
            // In actual rendering mode
            if (flexMode === 'full') {
                // Use full width minus 4 for terminal padding
                terminalWidth = detectedWidth - 6;
            } else if (flexMode === 'full-minus-40') {
                // Always subtract 41 for auto-compact message
                terminalWidth = detectedWidth - 40;
            } else if (flexMode === 'full-until-compact') {
                // Check context percentage to decide
                const threshold = settings.compactThreshold;
                const contextPercentage = context.tokenMetrics
                    ? Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100) : 0;

                if (contextPercentage >= threshold) {
                    // Context is high, leave space for auto-compact
                    terminalWidth = detectedWidth - 40;
                } else {
                    // Context is low, use full width minus 4 for padding
                    terminalWidth = detectedWidth - 6;
                }
            }
        }
    }

    const elements: { content: string; type: string; widget?: WidgetItem }[] = [];
    let hasFlexSeparator = false;

    // Build elements based on configured widgets
    for (let i = 0; i < widgets.length; i++) {
        const widget = widgets[i];
        if (!widget)
            continue;

        // Handle separators specially (they're not widgets)
        if (widget.type === 'separator') {
            // Check if there's any widget before this separator that actually rendered content
            // Look backwards to find ANY widget that produced content
            let hasContentBefore = false;
            for (let j = i - 1; j >= 0; j--) {
                const prevWidget = widgets[j];
                if (prevWidget && prevWidget.type !== 'separator' && prevWidget.type !== 'flex-separator') {
                    if (preRenderedWidgets[j]?.content) {
                        hasContentBefore = true;
                        break;
                    }
                    // Continue looking backwards even if this widget didn't render content
                }
            }
            if (!hasContentBefore)
                continue;

            const sepChar = widget.character ?? (settings.defaultSeparator ?? '|');
            const formattedSep = formatSeparator(sepChar);

            // Check if we should inherit colors from the previous widget
            let separatorColor = widget.color ?? 'gray';
            let separatorBg = widget.backgroundColor;
            let separatorBold = widget.bold;

            if (settings.inheritSeparatorColors && i > 0 && !widget.color && !widget.backgroundColor) {
                // Only inherit if the separator doesn't have explicit colors set
                const prevWidget = widgets[i - 1];
                if (prevWidget && prevWidget.type !== 'separator' && prevWidget.type !== 'flex-separator') {
                    // Get the previous widget's colors
                    let widgetColor = prevWidget.color;
                    if (!widgetColor) {
                        const widgetImpl = getWidget(prevWidget.type);
                        widgetColor = widgetImpl ? widgetImpl.getDefaultColor() : 'white';
                    }
                    separatorColor = widgetColor;
                    separatorBg = prevWidget.backgroundColor;
                    separatorBold = prevWidget.bold;
                }
            }

            elements.push({ content: applyColorsWithOverride(formattedSep, separatorColor, separatorBg, separatorBold), type: 'separator', widget });
            continue;
        }

        if (widget.type === 'flex-separator') {
            elements.push({ content: 'FLEX', type: 'flex-separator', widget });
            hasFlexSeparator = true;
            continue;
        }

        // Use widget registry for regular widgets
        try {
            let widgetText: string | undefined;
            let defaultColor = 'white';

            // Use pre-rendered content
            const preRendered = preRenderedWidgets[i];
            if (preRendered?.content) {
                widgetText = preRendered.content;
                // Get default color from widget impl for consistency
                const widgetImpl = getWidget(widget.type);
                if (widgetImpl) {
                    defaultColor = widgetImpl.getDefaultColor();
                }
            }

            if (widgetText) {
                // Special handling for custom-command with preserveColors
                if (widget.type === 'custom-command' && widget.preserveColors) {
                    // Handle max width truncation for commands with ANSI codes
                    let finalOutput = widgetText;
                    if (widget.maxWidth && widget.maxWidth > 0) {
                        const plainLength = widgetText.replace(ANSI_REGEX, '').length;
                        if (plainLength > widget.maxWidth) {
                            // Truncate while preserving ANSI codes
                            let truncated = '';
                            let currentLength = 0;
                            let inAnsiCode = false;
                            let ansiBuffer = '';

                            for (const char of widgetText) {
                                if (char === '\x1b') {
                                    inAnsiCode = true;
                                    ansiBuffer = char;
                                } else if (inAnsiCode) {
                                    ansiBuffer += char;
                                    if (char === 'm') {
                                        truncated += ansiBuffer;
                                        inAnsiCode = false;
                                        ansiBuffer = '';
                                    }
                                } else {
                                    if (currentLength < widget.maxWidth) {
                                        truncated += char;
                                        currentLength++;
                                    } else {
                                        break;
                                    }
                                }
                            }
                            finalOutput = truncated;
                        }
                    }
                    // Preserve original colors from command output
                    elements.push({ content: finalOutput, type: widget.type, widget });
                } else {
                    // Normal widget rendering with colors
                    elements.push({
                        content: applyColorsWithOverride(widgetText, widget.color ?? defaultColor, widget.backgroundColor, widget.bold),
                        type: widget.type,
                        widget
                    });
                }
            }
        } catch {
            // Unknown widget type - skip
            continue;
        }
    }

    if (elements.length === 0)
        return '';

    // Remove trailing separators
    while (elements.length > 0 && elements[elements.length - 1]?.type === 'separator') {
        elements.pop();
    }

    // Apply default padding and separators
    const finalElements: string[] = [];
    const padding = settings.defaultPadding ?? '';
    const defaultSep = settings.defaultSeparator ? formatSeparator(settings.defaultSeparator) : '';

    elements.forEach((elem, index) => {
        // Add default separator between any two items (but not before first item, and not around flex separators)
        const prevElem = index > 0 ? elements[index - 1] : null;
        const shouldAddSeparator = defaultSep && index > 0
            && elem.type !== 'flex-separator'
            && prevElem?.type !== 'flex-separator'
            && !prevElem?.widget?.merge; // Don't add separator if previous widget is merged with this one

        if (shouldAddSeparator) {
            // Check if we should inherit colors from the previous element
            if (settings.inheritSeparatorColors && index > 0) {
                const prevElem = elements[index - 1];
                if (prevElem?.widget) {
                    // Apply the previous element's colors to the separator (already handles override)
                    // Use the widget's color if set, otherwise get the default color for that widget type
                    let widgetColor = prevElem.widget.color;
                    if (!widgetColor && prevElem.widget.type !== 'separator' && prevElem.widget.type !== 'flex-separator') {
                        const widgetImpl = getWidget(prevElem.widget.type);
                        widgetColor = widgetImpl ? widgetImpl.getDefaultColor() : 'white';
                    }
                    const coloredSep = applyColorsWithOverride(defaultSep, widgetColor, prevElem.widget.backgroundColor, prevElem.widget.bold);
                    finalElements.push(coloredSep);
                } else {
                    finalElements.push(defaultSep);
                }
            } else if ((settings.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none')
                || (settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none')) {
                // Apply override colors even when not inheriting colors
                const coloredSep = applyColorsWithOverride(defaultSep, undefined, undefined);
                finalElements.push(coloredSep);
            } else {
                finalElements.push(defaultSep);
            }
        }

        // Add element with padding (separators don't get padding)
        if (elem.type === 'separator' || elem.type === 'flex-separator') {
            finalElements.push(elem.content);
        } else {
            // Check if padding should be omitted due to no-padding merge
            const nextElem = index < elements.length - 1 ? elements[index + 1] : null;
            const omitLeadingPadding = prevElem?.widget?.merge === 'no-padding';
            const omitTrailingPadding = elem.widget?.merge === 'no-padding' && nextElem;

            // Apply padding with colors (using overrides if set)
            const hasColorOverride = Boolean(settings.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none')
                || Boolean(settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none');

            if (padding && (elem.widget?.backgroundColor || hasColorOverride)) {
                // Apply colors to padding - applyColorsWithOverride will handle the overrides
                const leadingPadding = omitLeadingPadding ? '' : applyColorsWithOverride(padding, undefined, elem.widget?.backgroundColor);
                const trailingPadding = omitTrailingPadding ? '' : applyColorsWithOverride(padding, undefined, elem.widget?.backgroundColor);
                const paddedContent = leadingPadding + elem.content + trailingPadding;
                finalElements.push(paddedContent);
            } else if (padding) {
                // Wrap padding in ANSI reset codes to prevent trimming
                // This ensures leading spaces aren't trimmed by terminals
                const protectedPadding = chalk.reset(padding);
                const leadingPadding = omitLeadingPadding ? '' : protectedPadding;
                const trailingPadding = omitTrailingPadding ? '' : protectedPadding;
                finalElements.push(leadingPadding + elem.content + trailingPadding);
            } else {
                // No padding
                finalElements.push(elem.content);
            }
        }
    });

    // Build the final status line
    let statusLine = '';

    if (hasFlexSeparator && terminalWidth) {
        // Split elements by flex separators
        const parts: string[][] = [[]];
        let currentPart = 0;

        for (const elem of finalElements) {
            if (elem === 'FLEX') {
                currentPart++;
                parts[currentPart] = [];
            } else {
                parts[currentPart]?.push(elem);
            }
        }

        // Calculate total length of all non-flex content
        const partLengths = parts.map((part) => {
            const joined = part.join('');
            return joined.replace(ANSI_REGEX, '').length;
        });
        const totalContentLength = partLengths.reduce((sum, len) => sum + len, 0);

        // Calculate space to distribute among flex separators
        const flexCount = parts.length - 1; // Number of flex separators
        const totalSpace = Math.max(0, terminalWidth - totalContentLength);
        const spacePerFlex = flexCount > 0 ? Math.floor(totalSpace / flexCount) : 0;
        const extraSpace = flexCount > 0 ? totalSpace % flexCount : 0;

        // Build the status line with distributed spacing
        statusLine = '';
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part) {
                statusLine += part.join('');
            }
            if (i < parts.length - 1) {
                // Add flex spacing
                const spaces = spacePerFlex + (i < extraSpace ? 1 : 0);
                statusLine += ' '.repeat(spaces);
            }
        }
    } else {
        // No flex separator OR no width detected
        if (hasFlexSeparator && !terminalWidth) {
            // Treat flex separators as normal separators when width detection fails
            statusLine = finalElements.map(e => e === 'FLEX' ? chalk.gray(' | ') : e).join('');
        } else {
            // Just join all elements normally
            statusLine = finalElements.join('');
        }
    }

    // Truncate if the line exceeds the terminal width
    // Use terminalWidth if available (already accounts for flex mode adjustments), otherwise use detectedWidth
    const maxWidth = terminalWidth ?? detectedWidth;
    if (maxWidth && maxWidth > 0) {
        // Remove ANSI escape codes to get actual length
        const plainLength = statusLine.replace(ANSI_REGEX, '').length;

        if (plainLength > maxWidth) {
            // Need to truncate - preserve ANSI codes while truncating
            let truncated = '';
            let currentLength = 0;
            let inAnsiCode = false;
            let ansiBuffer = '';
            const targetLength = context.isPreview ? maxWidth - 3 : maxWidth - 3; // Reserve 3 chars for ellipsis

            for (const char of statusLine) {
                if (char === '\x1b') {
                    inAnsiCode = true;
                    ansiBuffer = char;
                } else if (inAnsiCode) {
                    ansiBuffer += char;
                    if (char === 'm') {
                        truncated += ansiBuffer;
                        inAnsiCode = false;
                        ansiBuffer = '';
                    }
                } else {
                    if (currentLength < targetLength) {
                        truncated += char;
                        currentLength++;
                    } else {
                        break;
                    }
                }
            }

            statusLine = truncated + '...';
        }
    }

    return statusLine;
}