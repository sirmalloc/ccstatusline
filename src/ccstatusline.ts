#!/usr/bin/env node
import chalk from 'chalk';

import { runTUI } from './tui';
import { loadSettings } from './utils/config';
import {
    getSessionDuration,
    getTokenMetrics,
    renderStatusLine,
    type RenderContext,
    type StatusJSON
} from './utils/renderer';

async function readStdin(): Promise<string | null> {
    // Check if stdin is a TTY (terminal) - if it is, there's no piped data
    if (process.stdin.isTTY) {
        return null;
    }

    const chunks: string[] = [];

    try {
        // Use Node.js compatible approach
        if (typeof Bun !== 'undefined') {
            // Bun environment
            const decoder = new TextDecoder();
            for await (const chunk of Bun.stdin.stream()) {
                chunks.push(decoder.decode(chunk));
            }
        } else {
            // Node.js environment
            process.stdin.setEncoding('utf8');
            for await (const chunk of process.stdin) {
                chunks.push(chunk as string);
            }
        }
        return chunks.join('');
    } catch {
        return null;
    }
}

async function renderMultipleLines(data: StatusJSON) {
    const settings = await loadSettings();

    // Set global chalk level based on settings
    chalk.level = settings.colorLevel;

    // Get all lines to render
    const lines = settings.lines;

    // Get token metrics if needed (check all lines)
    const hasTokenItems = lines.some(line => line.some(item => ['tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable'].includes(item.type)
    )
    );

    // Check if session clock is needed
    const hasSessionClock = lines.some(line => line.some(item => item.type === 'session-clock')
    );

    let tokenMetrics = null;
    if (hasTokenItems && data.transcript_path) {
        tokenMetrics = await getTokenMetrics(data.transcript_path);
    }

    let sessionDuration = null;
    if (hasSessionClock && data.transcript_path) {
        sessionDuration = await getSessionDuration(data.transcript_path);
    }

    // Create render context
    const context: RenderContext = {
        data,
        tokenMetrics,
        sessionDuration,
        isPreview: false
    };

    // Render each line
    for (const lineItems of lines) {
        if (lineItems.length > 0) {
            const line = renderStatusLine(lineItems, settings as unknown as Record<string, unknown>, context);
            // Replace all spaces with non-breaking spaces to prevent VSCode trimming
            let outputLine = line.replace(/ /g, '\u00A0');
            // Add reset code at the beginning to override Claude Code's dim setting
            outputLine = '\x1b[0m' + outputLine;
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
                const data = JSON.parse(input) as StatusJSON;
                await renderMultipleLines(data);
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

void main();