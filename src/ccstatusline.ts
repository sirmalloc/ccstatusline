#!/usr/bin/env node
import chalk from 'chalk';

import { runTUI } from './tui';
import type {
    BlockMetrics,
    TokenMetrics
} from './types';
import type { RenderContext } from './types/RenderContext';
import type { StatusJSON } from './types/StatusJSON';
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
    renderStatusLine
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
    if (hasTokenItems && data.transcript_path) {
        tokenMetrics = await getTokenMetrics(data.transcript_path);
    }

    let sessionDuration: string | null = null;
    if (hasSessionClock && data.transcript_path) {
        sessionDuration = await getSessionDuration(data.transcript_path);
    }

    let blockMetrics: BlockMetrics | null = null;
    if (hasBlockTimer) {
        blockMetrics = getBlockMetrics();
    }

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
        if (input && input.trim() !== '') {
            try {
                // Parse and validate JSON in one step
                const result = StatusJSONSchema.safeParse(JSON.parse(input));
                if (!result.success) {
                    console.error('Invalid status JSON format:', result.error.message);
                    process.exit(1);
                }

                await renderMultipleLines(result.data);
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