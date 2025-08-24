#!/usr/bin/env node
import chalk from 'chalk';

import { runTUI } from './tui';
import type {
    BlockMetrics,
    TokenMetrics
} from './types';
import { StatusJSONSchema } from './types/StatusJSON';
import { updateColorMap } from './utils/colors';
import {
    loadSettings,
    saveSettings
} from './utils/config';
import {
    getBlockMetrics,
    getSessionDuration,
    getTokenMetrics
} from './utils/jsonl';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
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

    // Create a timeout promise (500ms to account for slow systems/spawn delays)
    const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => { resolve(null); }, 500);
    });

    // Create the read promise
    const readPromise = (async () => {
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

                // Add a data check before entering the loop
                const hasData = await Promise.race([
                    new Promise(resolve => process.stdin.once('readable', () => { resolve(true); })),
                    new Promise(resolve => setTimeout(() => { resolve(false); }, 10))
                ]);

                if (!hasData)
                    return null;

                for await (const chunk of process.stdin) {
                    chunks.push(chunk as string);
                }
            }

            return chunks.join('');
        } catch {
            return null;
        }
    })();

    // Race between reading and timeout
    return Promise.race([readPromise, timeoutPromise]);
}

async function renderMultipleLines(data: StatusJSON) {
    const settings = await loadSettings();

    // Set global chalk level based on settings
    chalk.level = settings.colorLevel;
    // Update color map after setting chalk level
    updateColorMap();

    // Get all lines to render
    const lines = settings.lines;

    // Get token metrics if needed (check all lines)
    const hasTokenItems = lines.some(line => line.some(item => ['tokens-input', 'tokens-output', 'tokens-cached', 'tokens-total', 'context-length', 'context-percentage', 'context-percentage-usable'].includes(item.type)));

    // Check if session clock is needed
    const hasSessionClock = lines.some(line => line.some(item => item.type === 'session-clock'));

    // Check if block timer is needed
    const hasBlockTimer = lines.some(line => line.some(item => item.type === 'block-timer'));

    let tokenMetrics: TokenMetrics | null = null;
    if (hasTokenItems && data.transcript_path)
        tokenMetrics = await getTokenMetrics(data.transcript_path);

    let sessionDuration: string | null = null;
    if (hasSessionClock && data.transcript_path)
        sessionDuration = await getSessionDuration(data.transcript_path);

    let blockMetrics: BlockMetrics | null = null;
    if (hasBlockTimer && data.transcript_path)
        blockMetrics = getBlockMetrics(data.transcript_path);

    // Create render context
    const context: RenderContext = {
        data,
        tokenMetrics,
        sessionDuration,
        blockMetrics,
        isPreview: false
    };

    // Always pre-render all widgets once (for efficiency)
    const preRenderedLines = preRenderAllWidgets(lines, settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

    // Render each line using pre-rendered content
    let globalSeparatorIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineItems = lines[i];
        if (lineItems && lineItems.length > 0) {
            const lineContext = { ...context, lineIndex: i, globalSeparatorIndex };
            const preRenderedWidgets = preRenderedLines[i] ?? [];
            const line = renderStatusLine(lineItems, settings, lineContext, preRenderedWidgets, preCalculatedMaxWidths);

            // Only output the line if it has content (not just ANSI codes)
            // Strip ANSI codes to check if there's actual text
            const strippedLine = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
            if (strippedLine.length > 0) {
                // Count separators used in this line (widgets - 1, excluding merged widgets)
                const nonMergedWidgets = lineItems.filter((_, idx) => idx === lineItems.length - 1 || !lineItems[idx]?.merge);
                if (nonMergedWidgets.length > 1)
                    globalSeparatorIndex += nonMergedWidgets.length - 1;

                // Replace all spaces with non-breaking spaces to prevent VSCode trimming
                let outputLine = line.replace(/ /g, '\u00A0');

                // Add reset code at the beginning to override Claude Code's dim setting
                outputLine = '\x1b[0m' + outputLine;
                console.log(outputLine);
            }
        }
    }

    // Check if there's an update message to display
    if (settings.updatemessage?.message
        && settings.updatemessage.message.trim() !== ''
        && settings.updatemessage.remaining
        && settings.updatemessage.remaining > 0) {
        // Display the message
        console.log(settings.updatemessage.message);

        // Decrement the remaining count
        const newRemaining = settings.updatemessage.remaining - 1;

        // Update or remove the updatemessage
        if (newRemaining <= 0) {
            // Remove the entire updatemessage block
            const { updatemessage, ...newSettings } = settings;
            void updatemessage;
            await saveSettings(newSettings);
        } else {
            // Update the remaining count
            await saveSettings({
                ...settings,
                updatemessage: {
                    ...settings.updatemessage,
                    remaining: newRemaining
                }
            });
        }
    }
}

async function main() {
    // Check if we're in a piped/non-TTY environment first
    if (!process.stdin.isTTY) {
        // We're receiving piped input
        const input = await readStdin();
        if (input === null) {
            // Timeout or no data available in non-TTY environment
            console.log('ccstatusline: No input received from stdin (timeout after 500ms)');
            process.exit(0);
        } else if (input && input.trim() !== '') {
            try {
                // Parse and validate JSON in one step
                const result = StatusJSONSchema.safeParse(JSON.parse(input));
                if (!result.success) {
                    console.log('ccstatusline: Invalid status JSON format:', result.error.message);
                    process.exit(0);
                }

                await renderMultipleLines(result.data);
            } catch {
                console.log('ccstatusline: Error parsing statusline JSON -', input);
                process.exit(0);
            }
        } else {
            console.log('ccstatusline: No input received');
            process.exit(0);
        }
    } else {
        // Interactive mode - run TUI
        // Remove updatemessage before running TUI
        const settings = await loadSettings();
        if (settings.updatemessage) {
            const { updatemessage, ...newSettings } = settings;
            void updatemessage;
            await saveSettings(newSettings);
        }
        runTUI();
    }
}

void main();