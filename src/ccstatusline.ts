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

        // Return null if no changes at all (so the element doesn't appear)
        if (totalInsertions === 0 && totalDeletions === 0) {
            return null;
        }

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
                const data = JSON.parse(lines[i]);
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
        let lastMessageWithUsage: TranscriptLine | null = null;
        for (const line of lines) {
            try {
                const data: TranscriptLine = JSON.parse(line);
                if (data.message?.usage) {
                    inputTokens += data.message.usage.input_tokens || 0;
                    outputTokens += data.message.usage.output_tokens || 0;
                    cachedTokens += data.message.usage.cache_read_input_tokens || 0;
                    cachedTokens += data.message.usage.cache_creation_input_tokens || 0;
                    
                    // Keep track of the last message with usage data
                    lastMessageWithUsage = data;
                }
            } catch {
                // Skip invalid JSON lines
            }
        }

        // Calculate context length from the most recent message
        if (lastMessageWithUsage?.message?.usage) {
            const usage = lastMessageWithUsage.message.usage;
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
    const detectedWidth = getTerminalWidth();
    // Subtract 40 chars to account for right-side content like auto compact messages
    const terminalWidth = detectedWidth ? detectedWidth - 40 : null;
    const elements: { content: string, type: string }[] = [];
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
                    const color = (chalk as any)[item.color || settings.colors.model] || chalk.cyan;
                    elements.push({ content: color(`Model: ${data.model.display_name}`), type: 'model' });
                }
                break;

            case 'git-branch':
                const branch = getGitBranch();
                if (branch) {
                    const color = (chalk as any)[item.color || settings.colors.gitBranch] || chalk.magenta;
                    elements.push({ content: color(`⎇ ${branch}`), type: 'git-branch' });
                }
                break;

            case 'git-changes':
                const changes = getGitChanges();
                if (changes !== null) {
                    const color = (chalk as any)[item.color || 'yellow'] || chalk.yellow;
                    // Compact format: (+42,-10)
                    const changeStr = `(+${changes.insertions},-${changes.deletions})`;
                    elements.push({ content: color(changeStr), type: 'git-changes' });
                }
                break;

            case 'tokens-input':
                if (tokenMetrics) {
                    const color = (chalk as any)[item.color || 'yellow'] || chalk.yellow;
                    elements.push({ content: color(`In: ${formatTokens(tokenMetrics.inputTokens)}`), type: 'tokens-input' });
                }
                break;

            case 'tokens-output':
                if (tokenMetrics) {
                    const color = (chalk as any)[item.color || 'green'] || chalk.green;
                    elements.push({ content: color(`Out: ${formatTokens(tokenMetrics.outputTokens)}`), type: 'tokens-output' });
                }
                break;

            case 'tokens-cached':
                if (tokenMetrics) {
                    const color = (chalk as any)[item.color || 'blue'] || chalk.blue;
                    elements.push({ content: color(`Cached: ${formatTokens(tokenMetrics.cachedTokens)}`), type: 'tokens-cached' });
                }
                break;

            case 'tokens-total':
                if (tokenMetrics) {
                    const color = (chalk as any)[item.color || 'white'] || chalk.white;
                    elements.push({ content: color(`Total: ${formatTokens(tokenMetrics.totalTokens)}`), type: 'tokens-total' });
                }
                break;

            case 'context-length':
                if (tokenMetrics) {
                    const color = (chalk as any)[item.color || 'cyan'] || chalk.cyan;
                    elements.push({ content: color(`Ctx: ${formatTokens(tokenMetrics.contextLength)}`), type: 'context-length' });
                }
                break;

            case 'context-percentage':
                if (tokenMetrics) {
                    const percentage = Math.min(100, (tokenMetrics.contextLength / 200000) * 100);
                    const color = (chalk as any)[item.color || 'cyan'] || chalk.cyan;
                    elements.push({ content: color(`Ctx: ${percentage.toFixed(1)}%`), type: 'context-percentage' });
                }
                break;

            case 'terminal-width':
                const detectedWidth = terminalWidth || getTerminalWidth();
                if (detectedWidth) {
                    const color = (chalk as any)[item.color || 'dim'] || chalk.dim;
                    elements.push({ content: color(`Term: ${detectedWidth}`), type: 'terminal-width' });
                }
                break;

            case 'session-clock':
                if (sessionDuration) {
                    const color = (chalk as any)[item.color || 'blue'] || chalk.blue;
                    elements.push({ content: color(`Session: ${sessionDuration}`), type: 'session-clock' });
                }
                break;

            case 'version':
                const versionString = data.version || 'Unknown';
                const versionColor = (chalk as any)[item.color || 'green'] || chalk.green;
                elements.push({ content: versionColor(`Version: ${versionString}`), type: 'version' });
                break;

            case 'separator':
                // Only add separator if there are already elements and the last one isn't a separator
                const lastElement = elements[elements.length - 1];
                if (elements.length > 0 && lastElement && lastElement.type !== 'separator') {
                    const sepColor = (chalk as any)[settings.colors.separator] || chalk.dim;
                    const sepChar = item.character || '|';
                    // Handle special separator cases
                    let sepContent;
                    if (sepChar === ',') {
                        sepContent = sepColor(`${sepChar} `);
                    } else if (sepChar === ' ') {
                        sepContent = sepColor(' ');
                    } else {
                        sepContent = sepColor(` ${sepChar} `);
                    }
                    elements.push({ content: sepContent, type: 'separator' });
                }
                break;

            case 'flex-separator':
                elements.push({ content: 'FLEX', type: 'flex-separator' });
                hasFlexSeparator = true;
                break;
        }
    }

    if (elements.length === 0) return '';

    // Build the final status line
    let statusLine = '';

    if (hasFlexSeparator && terminalWidth) {
        // Split elements by flex separators
        const parts: string[][] = [[]];
        let currentPart = 0;

        for (const elem of elements) {
            if (elem.type === 'flex-separator') {
                currentPart++;
                parts[currentPart] = [];
            } else {
                parts[currentPart]!.push(elem.content);
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
            statusLine = elements.map(e => e.type === 'flex-separator' ? chalk.dim(' | ') : e.content).join('');
        } else {
            // Just join all elements normally
            statusLine = elements.map(e => e.content).join('');
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
            ['tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage'].includes(item.type)
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
    for (const lineItems of lines) {
        if (lineItems.length > 0) {
            const line = renderSingleLine(lineItems, settings, data, tokenMetrics, sessionDuration);
            console.log(line);
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