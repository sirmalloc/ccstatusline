import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';

// ANSI escape sequence for stripping color codes
const ANSI_REGEX = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
const ANSI_ESC = String.fromCharCode(27);

import type {
    RenderContext,
    TokenMetrics,
    TranscriptLine,
    WidgetItem
} from '../types';

import {
    applyColors,
    bgToFg,
    getColorAnsiCode,
    getWidgetDefaultColor
} from './colors';
import { getColorLevelString } from './config';

// Re-export types for backward compatibility
export type { StatusJSON } from '../types/StatusJSON';
export type { TokenMetrics, TokenUsage, TranscriptLine } from '../types/TokenMetrics';
export type { RenderContext } from '../types/RenderContext';

// Ensure fs.promises compatibility for older Node versions
const readFile = promisify(fs.readFile);

// Color functions moved to colors.ts
// Re-exported for backward compatibility
export { applyColors, getWidgetDefaultColor } from './colors';

// Helper function to format token counts
export function formatTokens(count: number): string {
    if (count >= 1000000)
        return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000)
        return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
}

export function getTerminalWidth(): number | null {
    try {
        // First try to get the tty of the parent process
        const tty = execSync('ps -o tty= -p $(ps -o ppid= -p $$)', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            shell: '/bin/sh'
        }).trim();

        // Check if we got a valid tty (not ?? which means no tty)
        if (tty && tty !== '??' && tty !== '?') {
            // Now get the terminal size
            const width = execSync(
                `stty size < /dev/${tty} | awk '{print $2}'`,
                {
                    encoding: 'utf8',
                    stdio: ['pipe', 'pipe', 'ignore'],
                    shell: '/bin/sh'
                }
            ).trim();

            const parsed = parseInt(width, 10);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }
    } catch {
        // Command failed, width detection not available
    }

    // Fallback: try tput cols which might work in some environments
    try {
        const width = execSync('tput cols 2>/dev/null', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        const parsed = parseInt(width, 10);
        if (!isNaN(parsed) && parsed > 0) {
            return parsed;
        }
    } catch {
        // tput also failed
    }

    return null;
}

export function getGitBranch(): string | null {
    try {
        const branch = execSync('git branch --show-current 2>/dev/null', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
        return branch || null;
    } catch {
        return null;
    }
}

export function getGitChanges(): { insertions: number; deletions: number } | null {
    try {
        let totalInsertions = 0;
        let totalDeletions = 0;

        // Get unstaged changes
        const unstagedStat = execSync('git diff --shortstat 2>/dev/null', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        // Get staged changes
        const stagedStat = execSync('git diff --cached --shortstat 2>/dev/null', {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        // Parse unstaged changes
        if (unstagedStat) {
            const insertMatch = /(\d+) insertion/.exec(unstagedStat);
            const deleteMatch = /(\d+) deletion/.exec(unstagedStat);
            totalInsertions += insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0;
            totalDeletions += deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0;
        }

        // Parse staged changes
        if (stagedStat) {
            const insertMatch = /(\d+) insertion/.exec(stagedStat);
            const deleteMatch = /(\d+) deletion/.exec(stagedStat);
            totalInsertions += insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0;
            totalDeletions += deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0;
        }

        // Always return the changes, even if they're zero
        return { insertions: totalInsertions, deletions: totalDeletions };
    } catch {
        return null;
    }
}

export async function getSessionDuration(transcriptPath: string): Promise<string | null> {
    try {
        if (!fs.existsSync(transcriptPath)) {
            return null;
        }

        const content = await readFile(transcriptPath, 'utf-8');
        const lines = content.trim().split('\n').filter((line: string) => line.trim());

        if (lines.length === 0) {
            return null;
        }

        let firstTimestamp: Date | null = null;
        let lastTimestamp: Date | null = null;

        // Find first valid timestamp
        for (const line of lines) {
            try {
                const data = JSON.parse(line) as { timestamp?: string };
                if (data.timestamp) {
                    firstTimestamp = new Date(data.timestamp);
                    break;
                }
            } catch {
                // Skip invalid lines
            }
        }

        // Find last valid timestamp (iterate backwards)
        for (let i = lines.length - 1; i >= 0; i--) {
            try {
                const data = JSON.parse(lines[i] ?? '') as { timestamp?: string };
                if (data.timestamp) {
                    lastTimestamp = new Date(data.timestamp);
                    break;
                }
            } catch {
                // Skip invalid lines
            }
        }

        if (!firstTimestamp || !lastTimestamp) {
            return null;
        }

        // Calculate duration in milliseconds
        const durationMs = lastTimestamp.getTime() - firstTimestamp.getTime();

        // Convert to minutes
        const totalMinutes = Math.floor(durationMs / (1000 * 60));

        if (totalMinutes < 1) {
            return '<1m';
        }

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours === 0) {
            return `${minutes}m`;
        } else if (minutes === 0) {
            return `${hours}hr`;
        } else {
            return `${hours}hr ${minutes}m`;
        }
    } catch {
        return null;
    }
}

export async function getTokenMetrics(transcriptPath: string): Promise<TokenMetrics> {
    try {
        // Use Node.js-compatible file reading
        if (!fs.existsSync(transcriptPath)) {
            return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: 0 };
        }

        const content = await readFile(transcriptPath, 'utf-8');
        const lines = content.trim().split('\n');

        let inputTokens = 0;
        let outputTokens = 0;
        let cachedTokens = 0;
        let contextLength = 0;

        // Parse each line and sum up token usage for totals
        let mostRecentMainChainEntry: TranscriptLine | null = null;
        let mostRecentTimestamp: Date | null = null;

        for (const line of lines) {
            try {
                const data = JSON.parse(line) as TranscriptLine;
                if (data.message?.usage) {
                    inputTokens += data.message.usage.input_tokens || 0;
                    outputTokens += data.message.usage.output_tokens || 0;
                    cachedTokens += data.message.usage.cache_read_input_tokens ?? 0;
                    cachedTokens += data.message.usage.cache_creation_input_tokens ?? 0;

                    // Track the most recent entry with isSidechain: false (or undefined, which defaults to main chain)
                    if (data.isSidechain !== true && data.timestamp) {
                        const entryTime = new Date(data.timestamp);
                        if (!mostRecentTimestamp || entryTime > mostRecentTimestamp) {
                            mostRecentTimestamp = entryTime;
                            mostRecentMainChainEntry = data;
                        }
                    }
                }
            } catch {
                // Skip invalid JSON lines
            }
        }

        // Calculate context length from the most recent main chain message
        if (mostRecentMainChainEntry?.message?.usage) {
            const usage = mostRecentMainChainEntry.message.usage;
            contextLength = (usage.input_tokens || 0)
                + (usage.cache_read_input_tokens ?? 0)
                + (usage.cache_creation_input_tokens ?? 0);
        }

        const totalTokens = inputTokens + outputTokens + cachedTokens;

        return { inputTokens, outputTokens, cachedTokens, totalTokens, contextLength };
    } catch {
        return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: 0 };
    }
}

function renderPowerlineStatusLine(
    widgets: WidgetItem[],
    settings: Record<string, unknown>,
    context: RenderContext
): string {
    const powerlineConfig = settings.powerline as Record<string, unknown> | undefined;
    const config = powerlineConfig ?? {};
    const separator = (config.separator as string) || '\uE0B0';
    const startCap = (config.startCap as string) || '';
    const endCap = (config.endCap as string) || '';

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
                terminalWidth = detectedWidth - 43;
            } else if (flexMode === 'full-until-compact') {
                terminalWidth = detectedWidth - 6;
            }
        } else {
            // In actual rendering mode
            if (flexMode === 'full') {
                terminalWidth = detectedWidth - 4;
            } else if (flexMode === 'full-minus-40') {
                terminalWidth = detectedWidth - 41;
            } else if (flexMode === 'full-until-compact') {
                const threshold = settings.compactThreshold as number;
                const contextPercentage = context.tokenMetrics
                    ? Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100) : 0;

                if (contextPercentage >= threshold) {
                    terminalWidth = detectedWidth - 40;
                } else {
                    terminalWidth = detectedWidth - 4;
                }
            }
        }
    }

    // Build widget elements (similar to regular mode but without separators)
    const widgetElements: { content: string; bgColor?: string; fgColor?: string; widget: WidgetItem }[] = [];

    for (let i = 0; i < filteredWidgets.length; i++) {
        const widget = filteredWidgets[i];
        if (!widget)
            continue;
        let widgetText = '';
        let defaultColor = 'white';

        switch (widget.type) {
        case 'model':
            if (context.isPreview) {
                widgetText = widget.rawValue ? 'Claude' : 'Model: Claude';
            } else if (context.data?.model) {
                widgetText = widget.rawValue ? context.data.model.display_name : `Model: ${context.data.model.display_name}`;
            }
            defaultColor = 'cyan';
            break;

        case 'git-branch':
            if (context.isPreview) {
                widgetText = widget.rawValue ? 'main' : '⎇ main';
            } else {
                const branch = context.gitBranch ?? getGitBranch();
                if (branch) {
                    widgetText = widget.rawValue ? branch : `⎇ ${branch}`;
                }
            }
            defaultColor = 'magenta';
            break;

        case 'git-changes':
            if (context.isPreview) {
                widgetText = '(+42,-10)';
            } else {
                const changes = context.gitChanges ?? getGitChanges();
                if (changes !== null) {
                    widgetText = `(+${changes.insertions},-${changes.deletions})`;
                }
            }
            defaultColor = 'yellow';
            break;

        case 'tokens-input':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '15.2k' : 'In: 15.2k';
            } else if (context.tokenMetrics) {
                widgetText = widget.rawValue ? formatTokens(context.tokenMetrics.inputTokens) : `In: ${formatTokens(context.tokenMetrics.inputTokens)}`;
            }
            defaultColor = 'blue';
            break;

        case 'tokens-output':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '3.4k' : 'Out: 3.4k';
            } else if (context.tokenMetrics) {
                widgetText = widget.rawValue ? formatTokens(context.tokenMetrics.outputTokens) : `Out: ${formatTokens(context.tokenMetrics.outputTokens)}`;
            }
            defaultColor = 'white';
            break;

        case 'tokens-cached':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '12k' : 'Cached: 12k';
            } else if (context.tokenMetrics) {
                widgetText = widget.rawValue ? formatTokens(context.tokenMetrics.cachedTokens) : `Cached: ${formatTokens(context.tokenMetrics.cachedTokens)}`;
            }
            defaultColor = 'cyan';
            break;

        case 'tokens-total':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '30.6k' : 'Total: 30.6k';
            } else if (context.tokenMetrics) {
                widgetText = widget.rawValue ? formatTokens(context.tokenMetrics.totalTokens) : `Total: ${formatTokens(context.tokenMetrics.totalTokens)}`;
            }
            defaultColor = 'cyan';
            break;

        case 'context-length':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '18.6k' : 'Ctx: 18.6k';
            } else if (context.tokenMetrics) {
                widgetText = widget.rawValue ? formatTokens(context.tokenMetrics.contextLength) : `Ctx: ${formatTokens(context.tokenMetrics.contextLength)}`;
            }
            defaultColor = 'gray';
            break;

        case 'context-percentage':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '9.3%' : 'Ctx: 9.3%';
            } else if (context.tokenMetrics) {
                const percentage = Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100);
                widgetText = widget.rawValue ? `${percentage.toFixed(1)}%` : `Ctx: ${percentage.toFixed(1)}%`;
            }
            defaultColor = 'blue';
            break;

        case 'context-percentage-usable':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '11.6%' : 'Ctx(u): 11.6%';
            } else if (context.tokenMetrics) {
                const percentage = Math.min(100, (context.tokenMetrics.contextLength / 160000) * 100);
                widgetText = widget.rawValue ? `${percentage.toFixed(1)}%` : `Ctx(u): ${percentage.toFixed(1)}%`;
            }
            defaultColor = 'green';
            break;

        case 'terminal-width': {
            const width = terminalWidth ?? getTerminalWidth();
            if (context.isPreview) {
                const detectedWidth = width ?? '??';
                widgetText = widget.rawValue ? `${detectedWidth}` : `Term: ${detectedWidth}`;
            } else if (width) {
                widgetText = widget.rawValue ? `${width}` : `Term: ${width}`;
            }
            defaultColor = 'gray';
            break;
        }

        case 'session-clock':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '2hr 15m' : 'Session: 2hr 15m';
            } else if (context.sessionDuration) {
                widgetText = widget.rawValue ? context.sessionDuration : `Session: ${context.sessionDuration}`;
            }
            defaultColor = 'yellow';
            break;

        case 'version':
            if (context.isPreview) {
                widgetText = widget.rawValue ? '1.0.0' : 'v1.0.0';
            } else if (context.data?.version) {
                widgetText = widget.rawValue ? context.data.version : `v${context.data.version}`;
            }
            defaultColor = 'gray';
            break;

        case 'custom-text':
            widgetText = widget.customText ?? '';
            defaultColor = 'white';
            break;

        case 'custom-command':
            if (context.isPreview) {
                widgetText = widget.commandPath ? `[cmd: ${widget.commandPath.substring(0, 20)}${widget.commandPath.length > 20 ? '...' : ''}]` : '[No command]';
            } else if (widget.commandPath && context.data) {
                try {
                    const timeout = widget.timeout ?? 1000;
                    const output = execSync(widget.commandPath, {
                        encoding: 'utf8',
                        input: JSON.stringify(context.data),
                        stdio: ['pipe', 'pipe', 'ignore'],
                        timeout: timeout
                    }).trim();

                    if (output) {
                        widgetText = output;
                        // Handle max width truncation
                        if (widget.maxWidth && widget.maxWidth > 0) {
                            const plainLength = output.replace(ANSI_REGEX, '').length;
                            if (plainLength > widget.maxWidth) {
                                // Simple truncation for powerline mode
                                widgetText = output.substring(0, widget.maxWidth);
                            }
                        }
                    }
                } catch {
                    // Command failed - skip
                }
            }
            defaultColor = 'white';
            break;
        }

        if (widgetText) {
            // Apply default padding from settings
            const padding = (settings.defaultPadding as string) || ' ';

            // If override FG color is set and this is a custom command with preserveColors,
            // we need to strip the ANSI codes from the widget text
            if ((settings.overrideForegroundColor as string) && (settings.overrideForegroundColor as string) !== 'none'
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

            // Determine colors - apply override FG color if set
            let fgColor = widget.color ?? defaultColor;
            if ((settings.overrideForegroundColor as string) && (settings.overrideForegroundColor as string) !== 'none') {
                fgColor = settings.overrideForegroundColor as string;
            }
            const bgColor = widget.backgroundColor;

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

    // Build the final powerline string
    let result = '';

    // Add start cap if specified
    if (startCap && widgetElements.length > 0) {
        const firstWidget = widgetElements[0];
        if (firstWidget?.bgColor) {
            // Start cap uses first widget's background as foreground (converted)
            const capFg = bgToFg(firstWidget.bgColor);
            const fgCode = getColorAnsiCode(capFg, colorLevel, false);
            result += fgCode + startCap + ANSI_ESC + '[39m';
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

        // Apply colors to widget content - include global bold setting
        const shouldBold = (settings.globalBold as boolean) || widget.widget.bold;
        const widgetContent = applyColors(widget.content, widget.fgColor, widget.bgColor, shouldBold, colorLevel);
        result += widgetContent;

        // Add separator between widgets (not after last one, and not if current widget is merged with next)
        if (i < widgetElements.length - 1 && separator && nextWidget && !widget.widget.merge) {
            // Check if this is a left-facing separator (Triangle Left \uE0B2 or Round Left \uE0B6)
            const isLeftFacing = separator === '\uE0B2' || separator === '\uE0B6';

            // Powerline separator coloring:
            // For right-facing separators (default):
            //   - Foreground: previous widget's background color (converted to fg)
            //   - Background: next widget's background color
            // For left-facing separators:
            //   - Foreground: next widget's background color (converted to fg)
            //   - Background: previous widget's background color

            // Build separator with raw ANSI codes to avoid reset issues
            let separatorOutput = '';

            if (isLeftFacing) {
                // Left-facing separator - reversed logic
                if (widget.bgColor && nextWidget.bgColor) {
                    // Both have backgrounds
                    const fgColor = bgToFg(nextWidget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    const bgCode = getColorAnsiCode(widget.bgColor, colorLevel, true);
                    separatorOutput = fgCode + bgCode + separator + ANSI_ESC + '[39m' + ANSI_ESC + '[49m';
                } else if (widget.bgColor && !nextWidget.bgColor) {
                    // Only previous widget has background - separator points left from colored to uncolored
                    const fgColor = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + ANSI_ESC + '[39m';
                } else if (!widget.bgColor && nextWidget.bgColor) {
                    // Only next widget has background
                    const fgColor = bgToFg(nextWidget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + ANSI_ESC + '[39m';
                } else {
                    // Neither has background
                    separatorOutput = separator;
                }
            } else {
                // Right-facing separator - standard logic
                if (widget.bgColor && nextWidget.bgColor) {
                    // Both have backgrounds - separator transitions from one to the other
                    const fgColor = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    const bgCode = getColorAnsiCode(nextWidget.bgColor, colorLevel, true);
                    separatorOutput = fgCode + bgCode + separator + ANSI_ESC + '[39m' + ANSI_ESC + '[49m';
                } else if (widget.bgColor && !nextWidget.bgColor) {
                    // Only previous widget has background - separator points right from colored
                    const fgColor = bgToFg(widget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + ANSI_ESC + '[39m';
                } else if (!widget.bgColor && nextWidget.bgColor) {
                    // Only next widget has background - separator points into colored area
                    const fgColor = bgToFg(nextWidget.bgColor);
                    const fgCode = getColorAnsiCode(fgColor, colorLevel, false);
                    separatorOutput = fgCode + separator + ANSI_ESC + '[39m';
                } else {
                    // Neither has background
                    separatorOutput = separator;
                }
            }

            result += separatorOutput;
        }
    }

    // Add end cap if specified
    if (endCap && widgetElements.length > 0) {
        const lastWidget = widgetElements[widgetElements.length - 1];
        if (lastWidget?.bgColor) {
            // End cap uses last widget's background as foreground (converted)
            const capFg = bgToFg(lastWidget.bgColor);
            const fgCode = getColorAnsiCode(capFg, colorLevel, false);
            result += fgCode + endCap + ANSI_ESC + '[39m';
        } else {
            result += endCap;
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
                if (char === ANSI_ESC) {
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

export function renderStatusLine(
    widgets: WidgetItem[],
    settings: Record<string, unknown>,
    context: RenderContext
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
    if (isPowerlineMode) {
        return renderPowerlineStatusLine(widgets, settings, context);
    }
    // Helper to apply colors with optional background and bold override
    const applyColorsWithOverride = (text: string, foregroundColor?: string, backgroundColor?: string, bold?: boolean): string => {
        // Override foreground color takes precedence over EVERYTHING, including passed foreground color
        let fgColor = foregroundColor;
        if ((settings.overrideForegroundColor as string) && (settings.overrideForegroundColor as string) !== 'none') {
            fgColor = settings.overrideForegroundColor as string;
        }

        // Override background color takes precedence over EVERYTHING, including passed background color
        let bgColor = backgroundColor;
        if ((settings.overrideBackgroundColor as string) && (settings.overrideBackgroundColor as string) !== 'none') {
            bgColor = settings.overrideBackgroundColor as string;
        }

        const shouldBold = (settings.globalBold as boolean) || bold;
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
                terminalWidth = detectedWidth - 43; // -40 for auto-compact + 3 for preview
            } else if (flexMode === 'full-until-compact') {
                // For preview, always show full width minus preview padding
                terminalWidth = detectedWidth - 6;
            }
        } else {
            // In actual rendering mode
            if (flexMode === 'full') {
                // Use full width minus 4 for terminal padding
                terminalWidth = detectedWidth - 4;
            } else if (flexMode === 'full-minus-40') {
                // Always subtract 41 for auto-compact message
                terminalWidth = detectedWidth - 41;
            } else if (flexMode === 'full-until-compact') {
                // Check context percentage to decide
                const threshold = settings.compactThreshold as number;
                const contextPercentage = context.tokenMetrics
                    ? Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100) : 0;

                if (contextPercentage >= threshold) {
                    // Context is high, leave space for auto-compact
                    terminalWidth = detectedWidth - 40;
                } else {
                    // Context is low, use full width minus 4 for padding
                    terminalWidth = detectedWidth - 4;
                }
            }
        }
    }

    const elements: { content: string; type: string; widget?: WidgetItem }[] = [];
    let hasFlexSeparator = false;

    // Build elements based on configured widgets
    for (const widget of widgets) {
        switch (widget.type) {
        case 'model':
            if (context.isPreview) {
                const modelText = widget.rawValue ? 'Claude' : 'Model: Claude';
                elements.push({ content: applyColorsWithOverride(modelText, widget.color ?? 'cyan', widget.backgroundColor, widget.bold), type: 'model', widget });
            } else if (context.data?.model) {
                const text = widget.rawValue ? context.data.model.display_name : `Model: ${context.data.model.display_name}`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'cyan', widget.backgroundColor, widget.bold), type: 'model', widget });
            }
            break;

        case 'git-branch':
            if (context.isPreview) {
                const branchText = widget.rawValue ? 'main' : '⎇ main';
                elements.push({ content: applyColorsWithOverride(branchText, widget.color ?? 'magenta', widget.backgroundColor, widget.bold), type: 'git-branch', widget });
            } else {
                const branch = context.gitBranch ?? getGitBranch();
                if (branch) {
                    const text = widget.rawValue ? branch : `⎇ ${branch}`;
                    elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'magenta', widget.backgroundColor, widget.bold), type: 'git-branch', widget });
                }
            }
            break;

        case 'git-changes':
            if (context.isPreview) {
                const changesText = '(+42,-10)';
                elements.push({ content: applyColorsWithOverride(changesText, widget.color ?? 'yellow', widget.backgroundColor, widget.bold), type: 'git-changes', widget });
            } else {
                const changes = context.gitChanges ?? getGitChanges();
                if (changes !== null) {
                    const changeStr = `(+${changes.insertions},-${changes.deletions})`;
                    elements.push({ content: applyColorsWithOverride(changeStr, widget.color ?? 'yellow', widget.backgroundColor, widget.bold), type: 'git-changes', widget });
                }
            }
            break;

        case 'tokens-input':
            if (context.isPreview) {
                const inputText = widget.rawValue ? '15.2k' : 'In: 15.2k';
                elements.push({ content: applyColorsWithOverride(inputText, widget.color ?? 'blue', widget.backgroundColor, widget.bold), type: 'tokens-input', widget });
            } else if (context.tokenMetrics) {
                const text = widget.rawValue ? formatTokens(context.tokenMetrics.inputTokens) : `In: ${formatTokens(context.tokenMetrics.inputTokens)}`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'blue', widget.backgroundColor, widget.bold), type: 'tokens-input', widget });
            }
            break;

        case 'tokens-output':
            if (context.isPreview) {
                const outputText = widget.rawValue ? '3.4k' : 'Out: 3.4k';
                elements.push({ content: applyColorsWithOverride(outputText, widget.color ?? 'white', widget.backgroundColor, widget.bold), type: 'tokens-output', widget });
            } else if (context.tokenMetrics) {
                const text = widget.rawValue ? formatTokens(context.tokenMetrics.outputTokens) : `Out: ${formatTokens(context.tokenMetrics.outputTokens)}`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'white', widget.backgroundColor, widget.bold), type: 'tokens-output', widget });
            }
            break;

        case 'tokens-cached':
            if (context.isPreview) {
                const cachedText = widget.rawValue ? '12k' : 'Cached: 12k';
                elements.push({ content: applyColorsWithOverride(cachedText, widget.color ?? 'cyan', widget.backgroundColor, widget.bold), type: 'tokens-cached', widget });
            } else if (context.tokenMetrics) {
                const text = widget.rawValue ? formatTokens(context.tokenMetrics.cachedTokens) : `Cached: ${formatTokens(context.tokenMetrics.cachedTokens)}`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'cyan', widget.backgroundColor, widget.bold), type: 'tokens-cached', widget });
            }
            break;

        case 'tokens-total':
            if (context.isPreview) {
                const totalText = widget.rawValue ? '30.6k' : 'Total: 30.6k';
                elements.push({ content: applyColorsWithOverride(totalText, widget.color ?? 'cyan', widget.backgroundColor, widget.bold), type: 'tokens-total', widget });
            } else if (context.tokenMetrics) {
                const text = widget.rawValue ? formatTokens(context.tokenMetrics.totalTokens) : `Total: ${formatTokens(context.tokenMetrics.totalTokens)}`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'cyan', widget.backgroundColor, widget.bold), type: 'tokens-total', widget });
            }
            break;

        case 'context-length':
            if (context.isPreview) {
                const ctxText = widget.rawValue ? '18.6k' : 'Ctx: 18.6k';
                elements.push({ content: applyColorsWithOverride(ctxText, widget.color ?? 'gray', widget.backgroundColor, widget.bold), type: 'context-length', widget });
            } else if (context.tokenMetrics) {
                const text = widget.rawValue ? formatTokens(context.tokenMetrics.contextLength) : `Ctx: ${formatTokens(context.tokenMetrics.contextLength)}`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'gray', widget.backgroundColor, widget.bold), type: 'context-length', widget });
            }
            break;

        case 'context-percentage':
            if (context.isPreview) {
                const ctxPctText = widget.rawValue ? '9.3%' : 'Ctx: 9.3%';
                elements.push({ content: applyColorsWithOverride(ctxPctText, widget.color ?? 'blue', widget.backgroundColor, widget.bold), type: 'context-percentage', widget });
            } else if (context.tokenMetrics) {
                const percentage = Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100);
                const text = widget.rawValue ? `${percentage.toFixed(1)}%` : `Ctx: ${percentage.toFixed(1)}%`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'blue', widget.backgroundColor, widget.bold), type: 'context-percentage', widget });
            }
            break;

        case 'context-percentage-usable':
            if (context.isPreview) {
                const ctxUsableText = widget.rawValue ? '11.6%' : 'Ctx(u): 11.6%';
                elements.push({ content: applyColorsWithOverride(ctxUsableText, widget.color ?? 'green', widget.backgroundColor, widget.bold), type: 'context-percentage-usable', widget });
            } else if (context.tokenMetrics) {
                // Calculate percentage out of 160,000 (80% of full context for auto-compact)
                const percentage = Math.min(100, (context.tokenMetrics.contextLength / 160000) * 100);
                const text = widget.rawValue ? `${percentage.toFixed(1)}%` : `Ctx(u): ${percentage.toFixed(1)}%`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'green', widget.backgroundColor, widget.bold), type: 'context-percentage-usable', widget });
            }
            break;

        case 'terminal-width': {
            const width = terminalWidth ?? getTerminalWidth();
            if (context.isPreview) {
                const detectedWidth = width ?? '??';
                const termText = widget.rawValue ? `${detectedWidth}` : `Term: ${detectedWidth}`;
                elements.push({ content: applyColorsWithOverride(termText, widget.color ?? 'gray', widget.backgroundColor, widget.bold), type: 'terminal-width', widget });
            } else if (width) {
                const text = widget.rawValue ? `${width}` : `Term: ${width}`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'gray', widget.backgroundColor, widget.bold), type: 'terminal-width', widget });
            }
            break;
        }

        case 'session-clock':
            if (context.isPreview) {
                const sessionText = widget.rawValue ? '2hr 15m' : 'Session: 2hr 15m';
                elements.push({ content: applyColorsWithOverride(sessionText, widget.color ?? 'yellow', widget.backgroundColor, widget.bold), type: 'session-clock', widget });
            } else if (context.sessionDuration) {
                const text = widget.rawValue ? context.sessionDuration : `Session: ${context.sessionDuration}`;
                elements.push({ content: applyColorsWithOverride(text, widget.color ?? 'yellow', widget.backgroundColor, widget.bold), type: 'session-clock', widget });
            }
            break;

        case 'version':
            if (context.isPreview) {
                const versionText = widget.rawValue ? '1.0.72' : 'Version: 1.0.72';
                elements.push({ content: applyColorsWithOverride(versionText, widget.color ?? 'green', widget.backgroundColor, widget.bold), type: 'version', widget });
            } else if (context.data?.version) {
                const versionString = context.data.version ?? 'Unknown';
                const versionText = widget.rawValue ? versionString : `Version: ${versionString}`;
                elements.push({ content: applyColorsWithOverride(versionText, widget.color ?? 'green', widget.backgroundColor, widget.bold), type: 'version', widget });
            }
            break;

        case 'separator': {
            // Always add separators - users should be able to add multiple if they want
            const sepChar = widget.character ?? '|';
            // Handle special separator cases
            let sepText;
            if (sepChar === ',') {
                sepText = `${sepChar} `;
            } else if (sepChar === ' ') {
                sepText = ' ';
            } else {
                sepText = ` ${sepChar} `;
            }
            // Use item color if specified, otherwise default to gray
            const sepContent = applyColorsWithOverride(sepText, widget.color ?? 'gray', widget.backgroundColor, widget.bold);
            elements.push({ content: sepContent, type: 'separator', widget });
            break;
        }

        case 'flex-separator':
            elements.push({ content: 'FLEX', type: 'flex-separator', widget });
            hasFlexSeparator = true;
            break;

        case 'custom-text': {
            const customText = widget.customText ?? '';
            elements.push({ content: applyColorsWithOverride(customText, widget.color ?? 'white', widget.backgroundColor, widget.bold), type: 'custom-text', widget });
            break;
        }

        case 'custom-command':
            if (context.isPreview) {
                const cmdText = widget.commandPath ? `[cmd: ${widget.commandPath.substring(0, 20)}${widget.commandPath.length > 20 ? '...' : ''}]` : '[No command]';
                // Only apply color if not preserving colors
                if (!widget.preserveColors) {
                    elements.push({ content: applyColorsWithOverride(cmdText, widget.color ?? 'white', widget.backgroundColor, widget.bold), type: 'custom-command', widget });
                } else {
                    // When preserving colors, just show the text without applying our colors
                    elements.push({ content: cmdText, type: 'custom-command', widget });
                }
            } else if (widget.commandPath && context.data) {
                try {
                    // Execute the command with JSON input via stdin
                    const timeout = widget.timeout ?? 1000; // Default to 1000ms if not specified
                    const output = execSync(widget.commandPath, {
                        encoding: 'utf8',
                        input: JSON.stringify(context.data),
                        stdio: ['pipe', 'pipe', 'ignore'],
                        timeout: timeout
                    }).trim();

                    if (output) {
                        let finalOutput = output;

                        // Handle max width truncation
                        if (widget.maxWidth && widget.maxWidth > 0) {
                            // Remove ANSI codes to measure actual length
                            const plainLength = output.replace(ANSI_REGEX, '').length;
                            if (plainLength > widget.maxWidth) {
                                // Truncate while preserving ANSI codes
                                let truncated = '';
                                let currentLength = 0;
                                let inAnsiCode = false;
                                let ansiBuffer = '';

                                for (const char of output) {
                                    if (char === ANSI_ESC) {
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

                        // Apply color if not preserving original colors
                        if (!widget.preserveColors) {
                            // Strip existing ANSI codes and apply new color
                            const stripped = finalOutput.replace(ANSI_REGEX, '');
                            elements.push({ content: applyColorsWithOverride(stripped, widget.color ?? 'white', widget.backgroundColor, widget.bold), type: 'custom-command', widget });
                        } else {
                            // Preserve original colors from command output - ignore any color property
                            elements.push({ content: finalOutput, type: 'custom-command', widget });
                        }
                    }
                } catch {
                    // Command failed or timed out - silently skip
                }
            }
            break;
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
    const padding = (settings.defaultPadding as string) || '';
    const defaultSep = (settings.defaultSeparator as string) || '';

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
                    const widgetColor = prevElem.widget.color ?? getWidgetDefaultColor(prevElem.widget.type);
                    const coloredSep = applyColorsWithOverride(defaultSep, widgetColor, prevElem.widget.backgroundColor, prevElem.widget.bold);
                    finalElements.push(coloredSep);
                } else {
                    finalElements.push(defaultSep);
                }
            } else if (((settings.overrideBackgroundColor as string) && (settings.overrideBackgroundColor as string) !== 'none')
                || ((settings.overrideForegroundColor as string) && (settings.overrideForegroundColor as string) !== 'none')) {
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
            const hasColorOverride = ((settings.overrideBackgroundColor as string) && (settings.overrideBackgroundColor as string) !== 'none')
                || ((settings.overrideForegroundColor as string) && (settings.overrideForegroundColor as string) !== 'none');

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
                if (char === ANSI_ESC) {
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