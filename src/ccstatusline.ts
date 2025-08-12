#!/usr/bin/env node
import chalk from 'chalk';
import { execSync } from 'child_process';
import { runTUI } from './tui.tsx';
import { loadSettings, type StatusItem } from './config';
import * as fs from 'fs';
import { promisify } from 'util';

// Ensure fs.promises compatibility for older Node versions
const readFile = fs.promises?.readFile || promisify(fs.readFile);

// Force chalk to use colors even when piped
chalk.level = 3;

// Helper function to apply foreground, background colors and bold
function applyColors(text: string, foregroundColor?: string, backgroundColor?: string, bold?: boolean): string {
    let result = text;

    // Standard color application
    // Ignore 'dim' color - it causes issues with terminal rendering
    if (foregroundColor && foregroundColor !== 'dim') {
        const fgFunc = (chalk as any)[foregroundColor];
        if (fgFunc) {
            result = fgFunc(result);
        }
    }

    if (backgroundColor && backgroundColor !== 'none') {
        const bgFunc = (chalk as any)[backgroundColor];
        if (bgFunc) {
            result = bgFunc(result);
        }
    }

    if (bold) {
        result = chalk.bold(result);
    }

    return result;
}

interface StatusJSON {
    session_id: string;
    transcript_path: string;
    cwd: string;
    model: {
        id: string;
        display_name: string;
    };
    workspace: {
        current_dir: string;
        project_dir: string;
    };
    version?: string;
}

interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

interface TranscriptLine {
    message?: {
        usage?: TokenUsage;
    };
    isSidechain?: boolean;
    timestamp?: string;
}

async function readStdin(): Promise<string | null> {
    // Check if stdin is a TTY (terminal) - if it is, there's no piped data
    if (process.stdin.isTTY) {
        return null;
    }

    const chunks: string[] = [];

    try {
        // Use Node.js compatible approach
        if (typeof Bun !== 'undefined' && Bun.stdin) {
            // Bun environment
            const decoder = new TextDecoder();
            for await (const chunk of Bun.stdin.stream()) {
                chunks.push(decoder.decode(chunk));
            }
        } else {
            // Node.js environment
            process.stdin.setEncoding('utf8');
            for await (const chunk of process.stdin) {
                chunks.push(chunk);
            }
        }
        return chunks.join('');
    } catch {
        return null;
    }
}

// Helper to get default color for an item type
function getItemDefaultColor(type: string): string {
    switch (type) {
        case 'model': return 'cyan';
        case 'git-branch': return 'magenta';
        case 'git-changes': return 'yellow';
        case 'session-clock': return 'yellow';
        case 'version': return 'green';
        case 'tokens-input': return 'blue';
        case 'tokens-output': return 'white';
        case 'tokens-cached': return 'cyan';
        case 'tokens-total': return 'cyan';
        case 'context-length': return 'gray';
        case 'context-percentage': return 'blue';
        case 'context-percentage-usable': return 'green';
        case 'terminal-width': return 'gray';
        case 'custom-text': return 'white';
        case 'custom-command': return 'white';
        case 'separator': return 'gray';
        default: return 'white';
    }
}

function getTerminalWidth(): number | null {
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

function getGitBranch(): string | null {
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

function getGitChanges(): { insertions: number; deletions: number } | null {
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
            const insertMatch = unstagedStat.match(/(\d+) insertion/);
            const deleteMatch = unstagedStat.match(/(\d+) deletion/);
            totalInsertions += insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0;
            totalDeletions += deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0;
        }

        // Parse staged changes
        if (stagedStat) {
            const insertMatch = stagedStat.match(/(\d+) insertion/);
            const deleteMatch = stagedStat.match(/(\d+) deletion/);
            totalInsertions += insertMatch?.[1] ? parseInt(insertMatch[1], 10) : 0;
            totalDeletions += deleteMatch?.[1] ? parseInt(deleteMatch[1], 10) : 0;
        }

        // Always return the changes, even if they're zero
        return { insertions: totalInsertions, deletions: totalDeletions };
    } catch {
        return null;
    }
}

async function getSessionDuration(transcriptPath: string): Promise<string | null> {
    try {
        if (!fs.existsSync(transcriptPath)) {
            return null;
        }

        const content = await readFile(transcriptPath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.trim());

        if (lines.length === 0) {
            return null;
        }

        let firstTimestamp: Date | null = null;
        let lastTimestamp: Date | null = null;

        // Find first valid timestamp
        for (const line of lines) {
            try {
                const data = JSON.parse(line);
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
                const data = JSON.parse(lines[i]!);
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

async function getTokenMetrics(transcriptPath: string): Promise<{
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    contextLength: number;
}> {
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
                const data: TranscriptLine = JSON.parse(line);
                if (data.message?.usage) {
                    inputTokens += data.message.usage.input_tokens || 0;
                    outputTokens += data.message.usage.output_tokens || 0;
                    cachedTokens += data.message.usage.cache_read_input_tokens || 0;
                    cachedTokens += data.message.usage.cache_creation_input_tokens || 0;

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
            contextLength = (usage.input_tokens || 0) +
                          (usage.cache_read_input_tokens || 0) +
                          (usage.cache_creation_input_tokens || 0);
        }

        const totalTokens = inputTokens + outputTokens + cachedTokens;

        return { inputTokens, outputTokens, cachedTokens, totalTokens, contextLength };
    } catch {
        return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: 0 };
    }
}

function renderSingleLine(items: StatusItem[], settings: any, data: StatusJSON, tokenMetrics: any, sessionDuration: string | null): string {
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

        const shouldBold = settings.globalBold || bold;
        return applyColors(text, fgColor, bgColor, shouldBold);
    };
    const detectedWidth = getTerminalWidth();
    // Calculate terminal width based on flex mode settings
    let terminalWidth: number | null = null;
    if (detectedWidth) {
        const flexMode = settings.flexMode || 'full-minus-40';

        if (flexMode === 'full') {
            // Use full width minus 4 for terminal padding
            terminalWidth = detectedWidth - 4;
        } else if (flexMode === 'full-minus-40') {
            // Always subtract 40 for auto-compact message
            terminalWidth = detectedWidth - 40;
        } else if (flexMode === 'full-until-compact') {
            // Check context percentage to decide
            const threshold = settings.compactThreshold || 60;
            const contextPercentage = tokenMetrics ?
                Math.min(100, (tokenMetrics.contextLength / 200000) * 100) : 0;

            if (contextPercentage >= threshold) {
                // Context is high, leave space for auto-compact
                terminalWidth = detectedWidth - 40;
            } else {
                // Context is low, use full width minus 4 for padding
                terminalWidth = detectedWidth - 4;
            }
        }
    }
    const elements: { content: string, type: string, item?: StatusItem }[] = [];
    let hasFlexSeparator = false;

    // Helper function to format token counts
    const formatTokens = (count: number): string => {
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
        return count.toString();
    };

    // Build elements based on configured items
    for (const item of items) {
        switch (item.type) {
            case 'model':
                if (data.model) {
                    const text = item.rawValue ? data.model.display_name : `Model: ${data.model.display_name}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'cyan', item.backgroundColor, item.bold), type: 'model', item });
                }
                break;

            case 'git-branch':
                const branch = getGitBranch();
                if (branch) {
                    const text = item.rawValue ? branch : `⎇ ${branch}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'magenta', item.backgroundColor, item.bold), type: 'git-branch', item });
                }
                break;

            case 'git-changes':
                const changes = getGitChanges();
                if (changes !== null) {
                    // Compact format: (+42,-10)
                    const changeStr = `(+${changes.insertions},-${changes.deletions})`;
                    elements.push({ content: applyColorsWithOverride(changeStr, item.color || 'yellow', item.backgroundColor, item.bold), type: 'git-changes', item });
                }
                break;

            case 'tokens-input':
                if (tokenMetrics) {
                    const text = item.rawValue ? formatTokens(tokenMetrics.inputTokens) : `In: ${formatTokens(tokenMetrics.inputTokens)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'blue', item.backgroundColor, item.bold), type: 'tokens-input', item });
                }
                break;

            case 'tokens-output':
                if (tokenMetrics) {
                    const text = item.rawValue ? formatTokens(tokenMetrics.outputTokens) : `Out: ${formatTokens(tokenMetrics.outputTokens)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'white', item.backgroundColor, item.bold), type: 'tokens-output', item });
                }
                break;

            case 'tokens-cached':
                if (tokenMetrics) {
                    const text = item.rawValue ? formatTokens(tokenMetrics.cachedTokens) : `Cached: ${formatTokens(tokenMetrics.cachedTokens)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'cyan', item.backgroundColor, item.bold), type: 'tokens-cached', item });
                }
                break;

            case 'tokens-total':
                if (tokenMetrics) {
                    const text = item.rawValue ? formatTokens(tokenMetrics.totalTokens) : `Total: ${formatTokens(tokenMetrics.totalTokens)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'cyan', item.backgroundColor, item.bold), type: 'tokens-total', item });
                }
                break;

            case 'context-length':
                if (tokenMetrics) {
                    const text = item.rawValue ? formatTokens(tokenMetrics.contextLength) : `Ctx: ${formatTokens(tokenMetrics.contextLength)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'gray', item.backgroundColor, item.bold), type: 'context-length', item });
                }
                break;

            case 'context-percentage':
                if (tokenMetrics) {
                    const percentage = Math.min(100, (tokenMetrics.contextLength / 200000) * 100);
                    const text = item.rawValue ? `${percentage.toFixed(1)}%` : `Ctx: ${percentage.toFixed(1)}%`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'blue', item.backgroundColor, item.bold), type: 'context-percentage', item });
                }
                break;

            case 'context-percentage-usable':
                if (tokenMetrics) {
                    // Calculate percentage out of 160,000 (80% of full context for auto-compact)
                    const percentage = Math.min(100, (tokenMetrics.contextLength / 160000) * 100);
                    const text = item.rawValue ? `${percentage.toFixed(1)}%` : `Ctx(u): ${percentage.toFixed(1)}%`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'green', item.backgroundColor, item.bold), type: 'context-percentage-usable', item });
                }
                break;

            case 'terminal-width':
                const width = terminalWidth || getTerminalWidth();
                if (width) {
                    const text = item.rawValue ? `${width}` : `Term: ${width}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'gray', item.backgroundColor, item.bold), type: 'terminal-width', item });
                }
                break;

            case 'session-clock':
                if (sessionDuration) {
                    const text = item.rawValue ? sessionDuration : `Session: ${sessionDuration}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'yellow', item.backgroundColor, item.bold), type: 'session-clock', item });
                }
                break;

            case 'version':
                const versionString = data.version || 'Unknown';
                const versionText = item.rawValue ? versionString : `Version: ${versionString}`;
                elements.push({ content: applyColorsWithOverride(versionText, item.color || 'green', item.backgroundColor, item.bold), type: 'version', item });
                break;

            case 'separator':
                // Only add separator if there are already elements and the last one isn't a separator
                const lastElement = elements[elements.length - 1];
                if (elements.length > 0 && lastElement && lastElement.type !== 'separator') {
                    const sepChar = item.character || '|';
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
                    const sepContent = applyColorsWithOverride(sepText, item.color || 'gray', item.backgroundColor, item.bold);
                    elements.push({ content: sepContent, type: 'separator', item });
                }
                break;

            case 'flex-separator':
                elements.push({ content: 'FLEX', type: 'flex-separator', item });
                hasFlexSeparator = true;
                break;

            case 'custom-text':
                const customText = item.customText || '';
                elements.push({ content: applyColorsWithOverride(customText, item.color || 'white', item.backgroundColor, item.bold), type: 'custom-text', item });
                break;

            case 'custom-command':
                if (item.commandPath) {
                    try {
                        // Execute the command with JSON input via stdin
                        const timeout = item.timeout || 1000; // Default to 1000ms if not specified
                        const output = execSync(item.commandPath, {
                            encoding: 'utf8',
                            input: JSON.stringify(data),
                            stdio: ['pipe', 'pipe', 'ignore'],
                            timeout: timeout
                        }).trim();

                        if (output) {
                            let finalOutput = output;

                            // Handle max width truncation
                            if (item.maxWidth && item.maxWidth > 0) {
                                // Remove ANSI codes to measure actual length
                                const plainLength = output.replace(/\x1b\[[0-9;]*m/g, '').length;
                                if (plainLength > item.maxWidth) {
                                    // Truncate while preserving ANSI codes
                                    let truncated = '';
                                    let currentLength = 0;
                                    let inAnsiCode = false;
                                    let ansiBuffer = '';

                                    for (let i = 0; i < output.length; i++) {
                                        const char = output[i];
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
                                            if (currentLength < item.maxWidth) {
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
                            if (!item.preserveColors) {
                                // Strip existing ANSI codes and apply new color
                                const stripped = finalOutput.replace(/\x1b\[[0-9;]*m/g, '');
                                elements.push({ content: applyColorsWithOverride(stripped, item.color || 'white', item.backgroundColor, item.bold), type: 'custom-command', item });
                            } else {
                                // Preserve original colors from command output - ignore any color property
                                elements.push({ content: finalOutput, type: 'custom-command', item });
                            }
                        }
                    } catch {
                        // Command failed or timed out - silently skip
                    }
                }
                break;
        }
    }

    if (elements.length === 0) return '';

    // Remove trailing separators
    while (elements.length > 0 && elements[elements.length - 1]?.type === 'separator') {
        elements.pop();
    }

    // Apply default padding and separators
    const finalElements: string[] = [];
    const padding = settings.defaultPadding || '';
    const defaultSep = settings.defaultSeparator || '';

    elements.forEach((elem, index) => {
        // Add default separator between any two items (but not before first item)
        if (defaultSep && index > 0) {
            // Check if we should inherit colors from the previous element
            if (settings.inheritSeparatorColors && index > 0) {
                const prevElem = elements[index - 1];
                if (prevElem && prevElem.item) {
                    // Apply the previous element's colors to the separator (already handles override)
                    // Use the item's color if set, otherwise get the default color for that item type
                    const itemColor = prevElem.item.color || getItemDefaultColor(prevElem.item.type);
                    const coloredSep = applyColorsWithOverride(defaultSep, itemColor, prevElem.item.backgroundColor, prevElem.item.bold);
                    finalElements.push(coloredSep);
                } else {
                    finalElements.push(defaultSep);
                }
            } else if ((settings.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none') ||
                       (settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none')) {
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
            // Apply padding with colors (using overrides if set)
            const hasColorOverride = (settings.overrideBackgroundColor && settings.overrideBackgroundColor !== 'none') ||
                                    (settings.overrideForegroundColor && settings.overrideForegroundColor !== 'none');

            if (padding && (elem.item?.backgroundColor || hasColorOverride)) {
                // Apply colors to padding - applyColorsWithOverride will handle the overrides
                const paddedContent = applyColorsWithOverride(padding, undefined, elem.item?.backgroundColor) +
                                     elem.content +
                                     applyColorsWithOverride(padding, undefined, elem.item?.backgroundColor);
                finalElements.push(paddedContent);
            } else {
                // No colors or no padding
                finalElements.push(padding + elem.content + padding);
            }
        }
    });

    // Build the final status line
    let statusLine = '';

    if (hasFlexSeparator && terminalWidth) {
        // Split elements by flex separators
        const parts: string[][] = [[]];
        let currentPart = 0;

        for (let i = 0; i < finalElements.length; i++) {
            const elem = finalElements[i];
            if (elem === 'FLEX' || (elements[i] && elements[i]?.type === 'flex-separator')) {
                currentPart++;
                parts[currentPart] = [];
            } else {
                parts[currentPart]?.push(elem!);
            }
        }

        // Calculate total length of all non-flex content
        const partLengths = parts.map(part => {
            const joined = part.join('');
            return joined.replace(/\x1b\[[0-9;]*m/g, '').length;
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
    if (detectedWidth && detectedWidth > 0) {
        // Remove ANSI escape codes to get actual length
        const plainLength = statusLine.replace(/\x1b\[[0-9;]*m/g, '').length;

        if (plainLength > detectedWidth) {
            // Need to truncate - preserve ANSI codes while truncating
            let truncated = '';
            let currentLength = 0;
            let inAnsiCode = false;
            let ansiBuffer = '';
            const targetLength = detectedWidth - 7; // Truncate to width-7 for proper fit

            for (let i = 0; i < statusLine.length; i++) {
                const char = statusLine[i];

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

async function renderStatusLine(data: StatusJSON) {
    const settings = await loadSettings();

    // Get all lines to render (support both old items format and new lines format)
    let lines: StatusItem[][] = [];
    if (settings.lines) {
        lines = settings.lines;
    } else if (settings.items) {
        // Legacy support for single line
        lines = [settings.items];
    } else {
        lines = [[]];
    }

    // Get token metrics if needed (check all lines)
    const hasTokenItems = lines.some(line =>
        line.some(item =>
            ['tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable'].includes(item.type)
        )
    );

    // Check if session clock is needed
    const hasSessionClock = lines.some(line =>
        line.some(item => item.type === 'session-clock')
    );

    let tokenMetrics: any = null;
    if (hasTokenItems && data.transcript_path) {
        tokenMetrics = await getTokenMetrics(data.transcript_path);
    }

    let sessionDuration: string | null = null;
    if (hasSessionClock && data.transcript_path) {
        sessionDuration = await getSessionDuration(data.transcript_path);
    }

    // Render each line
    for (let i = 0; i < lines.length; i++) {
        const lineItems = lines[i];
        if (lineItems && lineItems.length > 0) {
            const line = renderSingleLine(lineItems, settings, data, tokenMetrics, sessionDuration);
            // Replace all spaces with non-breaking spaces to prevent VSCode trimming
            const outputLine = line.replace(/ /g, '\u00A0');
            console.log(outputLine);
        }
    }
}

async function main() {
    // Check if we're in a piped/non-TTY environment first
    if (!process.stdin.isTTY) {
        // We're receiving piped input
        const input = await readStdin();
        if (input && input.trim() !== '') {
            try {
                const data: StatusJSON = JSON.parse(input);
                await renderStatusLine(data);
            } catch (error) {
                console.error('Error parsing JSON:', error);
                process.exit(1);
            }
        } else {
            console.error('No input received');
            process.exit(1);
        }
    } else {
        // Interactive mode - run TUI
        runTUI();
    }
}

main();
