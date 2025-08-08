#!/usr/bin/env node
import chalk from 'chalk';
import { execSync } from 'child_process';
import { runTUI } from './tui.tsx';
import { loadSettings } from './config';
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
        
        // Parse each line and sum up token usage
        for (const line of lines) {
            try {
                const data: TranscriptLine = JSON.parse(line);
                if (data.message?.usage) {
                    inputTokens += data.message.usage.input_tokens || 0;
                    outputTokens += data.message.usage.output_tokens || 0;
                    cachedTokens += data.message.usage.cache_read_input_tokens || 0;
                    cachedTokens += data.message.usage.cache_creation_input_tokens || 0;
                }
            } catch {
                // Skip invalid JSON lines
            }
        }
        
        const totalTokens = inputTokens + outputTokens + cachedTokens;
        const contextLength = inputTokens + outputTokens; // Current context size
        
        return { inputTokens, outputTokens, cachedTokens, totalTokens, contextLength };
    } catch {
        return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: 0 };
    }
}

async function renderStatusLine(data: StatusJSON) {
    const settings = await loadSettings();
    const terminalWidth = 80; // Always use 80 chars for Claude Code status line
    const elements: { content: string, type: string }[] = [];
    let hasFlexSeparator = false;
    
    // Get token metrics if needed
    const hasTokenItems = settings.items.some(item => 
        ['tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage'].includes(item.type)
    );
    
    let tokenMetrics: any = null;
    if (hasTokenItems && data.transcript_path) {
        tokenMetrics = await getTokenMetrics(data.transcript_path);
    }
    
    // Helper function to format token counts
    const formatTokens = (count: number): string => {
        if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
        if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
        return count.toString();
    };
    
    // Build elements based on configured items
    for (const item of settings.items) {
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
                
            case 'separator':
                // Only add separator if there are already elements and the last one isn't a separator
                const lastElement = elements[elements.length - 1];
                if (elements.length > 0 && lastElement && lastElement.type !== 'separator') {
                    const sepColor = (chalk as any)[settings.colors.separator] || chalk.dim;
                    elements.push({ content: sepColor(' | '), type: 'separator' });
                }
                break;
                
            case 'flex-separator':
                elements.push({ content: 'FLEX', type: 'flex-separator' });
                hasFlexSeparator = true;
                break;
        }
    }
    
    if (elements.length === 0) return;
    
    // Build the final status line
    let statusLine = '';
    
    if (hasFlexSeparator) {
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
        // No flex separator, just join all elements
        statusLine = elements.map(e => e.content).join('');
        
        // Pad to full width with spaces
        const contentLength = statusLine.replace(/\x1b\[[0-9;]*m/g, '').length;
        const remainingSpace = terminalWidth - contentLength;
        if (remainingSpace > 0) {
            statusLine = statusLine + ' '.repeat(remainingSpace);
        }
    }
    
    // Ensure we never exceed 80 chars
    const plainLength = statusLine.replace(/\x1b\[[0-9;]*m/g, '').length;
    if (plainLength > 80) {
        // Truncate with ellipsis if too long
        const visibleText = statusLine.replace(/\x1b\[[0-9;]*m/g, '');
        const truncated = visibleText.substring(0, 77) + '...';
        console.log(truncated);
    } else {
        console.log(statusLine);
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