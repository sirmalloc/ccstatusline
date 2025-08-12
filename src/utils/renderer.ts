import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { promisify } from 'util';
import type { StatusItem } from './config';

// Ensure fs.promises compatibility for older Node versions
const readFile = fs.promises?.readFile || promisify(fs.readFile);

// Force chalk to use colors even when piped
chalk.level = 3;

export interface StatusJSON {
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

export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
}

export interface TranscriptLine {
    message?: {
        usage?: TokenUsage;
    };
    isSidechain?: boolean;
    timestamp?: string;
}

export interface TokenMetrics {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    totalTokens: number;
    contextLength: number;
}

export interface RenderContext {
    data?: StatusJSON;
    tokenMetrics?: TokenMetrics | null;
    sessionDuration?: string | null;
    gitBranch?: string | null;
    gitChanges?: { insertions: number; deletions: number } | null;
    terminalWidth?: number | null;
    isPreview?: boolean;
}

// Helper function to apply foreground, background colors and bold
export function applyColors(text: string, foregroundColor?: string, backgroundColor?: string, bold?: boolean): string {
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

// Helper to get default color for an item type
export function getItemDefaultColor(type: string): string {
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

// Helper function to format token counts
export function formatTokens(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
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

export async function getSessionDuration(transcriptPath: string): Promise<string | null> {
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

export function renderStatusLine(
    items: StatusItem[],
    settings: any,
    context: RenderContext
): string {
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

    const detectedWidth = context.terminalWidth || getTerminalWidth();
    
    // Calculate terminal width based on flex mode settings
    let terminalWidth: number | null = null;
    if (detectedWidth) {
        const flexMode = settings.flexMode || 'full-minus-40';

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
                const threshold = settings.compactThreshold || 60;
                const contextPercentage = context.tokenMetrics ?
                    Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100) : 0;

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

    const elements: { content: string, type: string, item?: StatusItem }[] = [];
    let hasFlexSeparator = false;

    // Build elements based on configured items
    for (const item of items) {
        switch (item.type) {
            case 'model':
                if (context.isPreview) {
                    const modelText = item.rawValue ? 'Claude' : 'Model: Claude';
                    elements.push({ content: applyColorsWithOverride(modelText, item.color || 'cyan', item.backgroundColor, item.bold), type: 'model', item });
                } else if (context.data?.model) {
                    const text = item.rawValue ? context.data.model.display_name : `Model: ${context.data.model.display_name}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'cyan', item.backgroundColor, item.bold), type: 'model', item });
                }
                break;

            case 'git-branch':
                if (context.isPreview) {
                    const branchText = item.rawValue ? 'main' : '⎇ main';
                    elements.push({ content: applyColorsWithOverride(branchText, item.color || 'magenta', item.backgroundColor, item.bold), type: 'git-branch', item });
                } else {
                    const branch = context.gitBranch || getGitBranch();
                    if (branch) {
                        const text = item.rawValue ? branch : `⎇ ${branch}`;
                        elements.push({ content: applyColorsWithOverride(text, item.color || 'magenta', item.backgroundColor, item.bold), type: 'git-branch', item });
                    }
                }
                break;

            case 'git-changes':
                if (context.isPreview) {
                    const changesText = '(+42,-10)';
                    elements.push({ content: applyColorsWithOverride(changesText, item.color || 'yellow', item.backgroundColor, item.bold), type: 'git-changes', item });
                } else {
                    const changes = context.gitChanges || getGitChanges();
                    if (changes !== null) {
                        const changeStr = `(+${changes.insertions},-${changes.deletions})`;
                        elements.push({ content: applyColorsWithOverride(changeStr, item.color || 'yellow', item.backgroundColor, item.bold), type: 'git-changes', item });
                    }
                }
                break;

            case 'tokens-input':
                if (context.isPreview) {
                    const inputText = item.rawValue ? '15.2k' : 'In: 15.2k';
                    elements.push({ content: applyColorsWithOverride(inputText, item.color || 'blue', item.backgroundColor, item.bold), type: 'tokens-input', item });
                } else if (context.tokenMetrics) {
                    const text = item.rawValue ? formatTokens(context.tokenMetrics.inputTokens) : `In: ${formatTokens(context.tokenMetrics.inputTokens)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'blue', item.backgroundColor, item.bold), type: 'tokens-input', item });
                }
                break;

            case 'tokens-output':
                if (context.isPreview) {
                    const outputText = item.rawValue ? '3.4k' : 'Out: 3.4k';
                    elements.push({ content: applyColorsWithOverride(outputText, item.color || 'white', item.backgroundColor, item.bold), type: 'tokens-output', item });
                } else if (context.tokenMetrics) {
                    const text = item.rawValue ? formatTokens(context.tokenMetrics.outputTokens) : `Out: ${formatTokens(context.tokenMetrics.outputTokens)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'white', item.backgroundColor, item.bold), type: 'tokens-output', item });
                }
                break;

            case 'tokens-cached':
                if (context.isPreview) {
                    const cachedText = item.rawValue ? '12k' : 'Cached: 12k';
                    elements.push({ content: applyColorsWithOverride(cachedText, item.color || 'cyan', item.backgroundColor, item.bold), type: 'tokens-cached', item });
                } else if (context.tokenMetrics) {
                    const text = item.rawValue ? formatTokens(context.tokenMetrics.cachedTokens) : `Cached: ${formatTokens(context.tokenMetrics.cachedTokens)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'cyan', item.backgroundColor, item.bold), type: 'tokens-cached', item });
                }
                break;

            case 'tokens-total':
                if (context.isPreview) {
                    const totalText = item.rawValue ? '30.6k' : 'Total: 30.6k';
                    elements.push({ content: applyColorsWithOverride(totalText, item.color || 'cyan', item.backgroundColor, item.bold), type: 'tokens-total', item });
                } else if (context.tokenMetrics) {
                    const text = item.rawValue ? formatTokens(context.tokenMetrics.totalTokens) : `Total: ${formatTokens(context.tokenMetrics.totalTokens)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'cyan', item.backgroundColor, item.bold), type: 'tokens-total', item });
                }
                break;

            case 'context-length':
                if (context.isPreview) {
                    const ctxText = item.rawValue ? '18.6k' : 'Ctx: 18.6k';
                    elements.push({ content: applyColorsWithOverride(ctxText, item.color || 'gray', item.backgroundColor, item.bold), type: 'context-length', item });
                } else if (context.tokenMetrics) {
                    const text = item.rawValue ? formatTokens(context.tokenMetrics.contextLength) : `Ctx: ${formatTokens(context.tokenMetrics.contextLength)}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'gray', item.backgroundColor, item.bold), type: 'context-length', item });
                }
                break;

            case 'context-percentage':
                if (context.isPreview) {
                    const ctxPctText = item.rawValue ? '9.3%' : 'Ctx: 9.3%';
                    elements.push({ content: applyColorsWithOverride(ctxPctText, item.color || 'blue', item.backgroundColor, item.bold), type: 'context-percentage', item });
                } else if (context.tokenMetrics) {
                    const percentage = Math.min(100, (context.tokenMetrics.contextLength / 200000) * 100);
                    const text = item.rawValue ? `${percentage.toFixed(1)}%` : `Ctx: ${percentage.toFixed(1)}%`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'blue', item.backgroundColor, item.bold), type: 'context-percentage', item });
                }
                break;

            case 'context-percentage-usable':
                if (context.isPreview) {
                    const ctxUsableText = item.rawValue ? '11.6%' : 'Ctx(u): 11.6%';
                    elements.push({ content: applyColorsWithOverride(ctxUsableText, item.color || 'green', item.backgroundColor, item.bold), type: 'context-percentage-usable', item });
                } else if (context.tokenMetrics) {
                    // Calculate percentage out of 160,000 (80% of full context for auto-compact)
                    const percentage = Math.min(100, (context.tokenMetrics.contextLength / 160000) * 100);
                    const text = item.rawValue ? `${percentage.toFixed(1)}%` : `Ctx(u): ${percentage.toFixed(1)}%`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'green', item.backgroundColor, item.bold), type: 'context-percentage-usable', item });
                }
                break;

            case 'terminal-width':
                const width = terminalWidth || getTerminalWidth();
                if (context.isPreview) {
                    const detectedWidth = width || '??';
                    const termText = item.rawValue ? `${detectedWidth}` : `Term: ${detectedWidth}`;
                    elements.push({ content: applyColorsWithOverride(termText, item.color || 'gray', item.backgroundColor, item.bold), type: 'terminal-width', item });
                } else if (width) {
                    const text = item.rawValue ? `${width}` : `Term: ${width}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'gray', item.backgroundColor, item.bold), type: 'terminal-width', item });
                }
                break;

            case 'session-clock':
                if (context.isPreview) {
                    const sessionText = item.rawValue ? '2hr 15m' : 'Session: 2hr 15m';
                    elements.push({ content: applyColorsWithOverride(sessionText, item.color || 'yellow', item.backgroundColor, item.bold), type: 'session-clock', item });
                } else if (context.sessionDuration) {
                    const text = item.rawValue ? context.sessionDuration : `Session: ${context.sessionDuration}`;
                    elements.push({ content: applyColorsWithOverride(text, item.color || 'yellow', item.backgroundColor, item.bold), type: 'session-clock', item });
                }
                break;

            case 'version':
                if (context.isPreview) {
                    const versionText = item.rawValue ? '1.0.72' : 'Version: 1.0.72';
                    elements.push({ content: applyColorsWithOverride(versionText, item.color || 'green', item.backgroundColor, item.bold), type: 'version', item });
                } else if (context.data?.version) {
                    const versionString = context.data.version || 'Unknown';
                    const versionText = item.rawValue ? versionString : `Version: ${versionString}`;
                    elements.push({ content: applyColorsWithOverride(versionText, item.color || 'green', item.backgroundColor, item.bold), type: 'version', item });
                }
                break;

            case 'separator':
                // Always add separators - users should be able to add multiple if they want
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
                if (context.isPreview) {
                    const cmdText = item.commandPath ? `[cmd: ${item.commandPath.substring(0, 20)}${item.commandPath.length > 20 ? '...' : ''}]` : '[No command]';
                    // Only apply color if not preserving colors
                    if (!item.preserveColors) {
                        elements.push({ content: applyColorsWithOverride(cmdText, item.color || 'white', item.backgroundColor, item.bold), type: 'custom-command', item });
                    } else {
                        // When preserving colors, just show the text without applying our colors
                        elements.push({ content: cmdText, type: 'custom-command', item });
                    }
                } else if (item.commandPath && context.data) {
                    try {
                        // Execute the command with JSON input via stdin
                        const timeout = item.timeout || 1000; // Default to 1000ms if not specified
                        const output = execSync(item.commandPath, {
                            encoding: 'utf8',
                            input: JSON.stringify(context.data),
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
        // Add default separator between any two items (but not before first item, and not around flex separators)
        const prevElem = index > 0 ? elements[index - 1] : null;
        const shouldAddSeparator = defaultSep && index > 0 && 
                                   elem.type !== 'flex-separator' && 
                                   prevElem?.type !== 'flex-separator';
        
        if (shouldAddSeparator) {
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
            if (elem === 'FLEX') {
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
    // Use terminalWidth if available (already accounts for flex mode adjustments), otherwise use detectedWidth
    const maxWidth = terminalWidth || detectedWidth;
    if (maxWidth && maxWidth > 0) {
        // Remove ANSI escape codes to get actual length
        const plainLength = statusLine.replace(/\x1b\[[0-9;]*m/g, '').length;

        if (plainLength > maxWidth) {
            // Need to truncate - preserve ANSI codes while truncating
            let truncated = '';
            let currentLength = 0;
            let inAnsiCode = false;
            let ansiBuffer = '';
            const targetLength = context.isPreview ? maxWidth - 3 : maxWidth - 3; // Reserve 3 chars for ellipsis

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