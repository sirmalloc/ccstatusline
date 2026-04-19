#!/usr/bin/env node
import chalk from 'chalk';

import { runTUI } from './tui';
import type {
    SkillsMetrics,
    SpeedMetrics,
    TokenMetrics,
    ToolCountMetrics
} from './types';
import type { AgentActivityMetrics } from './types/AgentActivityMetrics';
import type { RenderContext } from './types/RenderContext';
import type { StatusJSON } from './types/StatusJSON';
import { StatusJSONSchema } from './types/StatusJSON';
import {
    getAgentActivityFilePath,
    getAgentActivityMetrics
} from './utils/agent-activity';
import { getVisibleText } from './utils/ansi';
import { updateColorMap } from './utils/colors';
import {
    initConfigPath,
    loadSettings,
    saveSettings
} from './utils/config';
import {
    getSessionDuration,
    getSpeedMetricsCollection,
    getTokenMetrics
} from './utils/jsonl';
import { advanceGlobalPowerlineThemeIndex } from './utils/powerline-theme-index';
import {
    calculateMaxWidthsFromPreRendered,
    preRenderAllWidgets,
    renderStatusLine
} from './utils/renderer';
import { advanceGlobalSeparatorIndex } from './utils/separator-index';
import {
    getSkillsFilePath,
    getSkillsMetrics
} from './utils/skills';
import {
    getWidgetSpeedWindowSeconds,
    isWidgetSpeedWindowEnabled
} from './utils/speed-window';
import {
    classifyTool,
    getToolCountFilePath,
    getToolCountMetrics
} from './utils/tool-count';
import { prefetchUsageDataIfNeeded } from './utils/usage-prefetch';

function hasSessionDurationInStatusJson(data: StatusJSON): boolean {
    const durationMs = data.cost?.total_duration_ms;
    return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0;
}

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

async function ensureWindowsUtf8CodePage() {
    if (process.platform !== 'win32') {
        return;
    }

    try {
        const { execFileSync } = await import('child_process');
        execFileSync('chcp.com', ['65001'], { stdio: 'ignore' });
    } catch {
        // Ignore failures to preserve statusline output even in restricted shells.
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

    // Check if session clock is needed
    const hasSessionClock = lines.some(line => line.some(item => item.type === 'session-clock'));

    const speedWidgetTypes = new Set(['output-speed', 'input-speed', 'total-speed']);
    const hasSpeedItems = lines.some(line => line.some(item => speedWidgetTypes.has(item.type)));
    const requestedSpeedWindows = new Set<number>();
    for (const line of lines) {
        for (const item of line) {
            if (speedWidgetTypes.has(item.type) && isWidgetSpeedWindowEnabled(item)) {
                requestedSpeedWindows.add(getWidgetSpeedWindowSeconds(item));
            }
        }
    }

    let tokenMetrics: TokenMetrics | null = null;
    if (data.transcript_path) {
        tokenMetrics = await getTokenMetrics(data.transcript_path);
    }

    let sessionDuration: string | null = null;
    if (hasSessionClock && !hasSessionDurationInStatusJson(data) && data.transcript_path) {
        sessionDuration = await getSessionDuration(data.transcript_path);
    }

    const usageData = await prefetchUsageDataIfNeeded(lines, data);

    let speedMetrics: SpeedMetrics | null = null;
    let windowedSpeedMetrics: Record<string, SpeedMetrics> | null = null;
    if (hasSpeedItems && data.transcript_path) {
        const speedMetricsCollection = await getSpeedMetricsCollection(data.transcript_path, {
            includeSubagents: true,
            windowSeconds: Array.from(requestedSpeedWindows)
        });

        speedMetrics = speedMetricsCollection.sessionAverage;
        windowedSpeedMetrics = speedMetricsCollection.windowed;
    }

    let skillsMetrics: SkillsMetrics | null = null;
    if (data.session_id) {
        skillsMetrics = getSkillsMetrics(data.session_id);
    }

    const hasToolCount = lines.some(line => line.some(item => item.type === 'tool-count'));
    let toolCountMetrics: ToolCountMetrics | null = null;
    if (hasToolCount && data.session_id) {
        toolCountMetrics = getToolCountMetrics(data.session_id);
    }

    const hasAgentActivity = lines.some(line => line.some(item => item.type === 'agent-activity'));
    let agentActivityMetrics: AgentActivityMetrics | null = null;
    if (hasAgentActivity && data.session_id) {
        agentActivityMetrics = getAgentActivityMetrics(data.session_id);
    }

    // Create render context
    const context: RenderContext = {
        data,
        tokenMetrics,
        speedMetrics,
        windowedSpeedMetrics,
        usageData,
        sessionDuration,
        skillsMetrics,
        toolCountMetrics,
        agentActivityMetrics,
        isPreview: false,
        minimalist: settings.minimalistMode
    };

    // Always pre-render all widgets once (for efficiency)
    const preRenderedLines = preRenderAllWidgets(lines, settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

    // Render each line using pre-rendered content
    let globalSeparatorIndex = 0;
    let globalPowerlineThemeIndex = 0;
    for (let i = 0; i < lines.length; i++) {
        const lineItems = lines[i];
        if (lineItems && lineItems.length > 0) {
            const preRenderedWidgets = preRenderedLines[i] ?? [];
            const lineContext = {
                ...context,
                lineIndex: i,
                globalSeparatorIndex,
                globalPowerlineThemeIndex
            };
            const line = renderStatusLine(lineItems, settings, lineContext, preRenderedWidgets, preCalculatedMaxWidths);

            // Only output the line if it has content (not just ANSI codes)
            // Strip ANSI codes to check if there's actual text
            const strippedLine = getVisibleText(line).trim();
            if (strippedLine.length > 0) {
                // Replace all spaces with non-breaking spaces to prevent VSCode trimming
                let outputLine = line.replace(/ /g, '\u00A0');

                // Add reset code at the beginning to override Claude Code's dim setting
                outputLine = '\x1b[0m' + outputLine;
                console.log(outputLine);

                globalSeparatorIndex = advanceGlobalSeparatorIndex(globalSeparatorIndex, lineItems);
                if (settings.powerline.enabled && settings.powerline.continueThemeAcrossLines) {
                    globalPowerlineThemeIndex = advanceGlobalPowerlineThemeIndex(globalPowerlineThemeIndex, preRenderedWidgets);
                }
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

function parseConfigArg(): string | undefined {
    const idx = process.argv.indexOf('--config');
    if (idx === -1)
        return undefined;
    const configPath = process.argv[idx + 1];
    if (!configPath || configPath.startsWith('--')) {
        console.error('--config requires a file path argument');
        process.exit(1);
    }
    process.argv.splice(idx, 2);
    return configPath;
}

interface HookInput {
    session_id?: string;
    hook_event_name?: string;
    tool_name?: string;
    tool_use_id?: string;
    tool_input?: {
        skill?: string;
        subagent_type?: string;
        model?: string;
        description?: string;
    };
    prompt?: string;
}

async function handleHook(): Promise<void> {
    const input = await readStdin();
    if (!input) {
        console.log('{}');
        return;
    }
    try {
        const data = JSON.parse(input) as HookInput;
        const sessionId = data.session_id;
        if (!sessionId) {
            console.log('{}');
            return;
        }

        const fs = await import('fs');
        const path = await import('path');

        let skillName = '';
        if (data.hook_event_name === 'PreToolUse' && data.tool_name === 'Skill') {
            skillName = data.tool_input?.skill ?? '';
        } else if (data.hook_event_name === 'UserPromptSubmit') {
            const match = /^\/([a-zA-Z0-9_:-]+)(?:\s|$)/.exec(data.prompt ?? '');
            if (match) {
                skillName = match[1] ?? '';
            }
        }

        if (skillName) {
            const skillsPath = getSkillsFilePath(sessionId);
            fs.mkdirSync(path.dirname(skillsPath), { recursive: true });
            const entry = JSON.stringify({
                timestamp: new Date().toISOString(),
                session_id: sessionId,
                skill: skillName,
                source: data.hook_event_name
            });
            fs.appendFileSync(skillsPath, entry + '\n');
        }

        // Skill is logged above; don't double-count it here.
        if (data.hook_event_name === 'PreToolUse'
            && data.tool_name
            && data.tool_name !== 'Skill') {
            const toolCountPath = getToolCountFilePath(sessionId);
            fs.mkdirSync(path.dirname(toolCountPath), { recursive: true });
            const entry = JSON.stringify({
                timestamp: new Date().toISOString(),
                session_id: sessionId,
                tool_name: data.tool_name,
                category: classifyTool(data.tool_name)
            });
            fs.appendFileSync(toolCountPath, entry + '\n');
        }

        // Agent Activity — start event (Task subagent began)
        if (data.hook_event_name === 'PreToolUse'
            && data.tool_name === 'Task'
            && typeof data.tool_use_id === 'string'
            && data.tool_use_id.length > 0) {
            const agentPath = getAgentActivityFilePath(sessionId);
            fs.mkdirSync(path.dirname(agentPath), { recursive: true });
            const entry = JSON.stringify({
                timestamp: new Date().toISOString(),
                session_id: sessionId,
                event: 'start',
                id: data.tool_use_id,
                type: typeof data.tool_input?.subagent_type === 'string'
                    ? data.tool_input.subagent_type
                    : 'unknown',
                model: typeof data.tool_input?.model === 'string' ? data.tool_input.model : undefined,
                description: typeof data.tool_input?.description === 'string' ? data.tool_input.description : undefined
            });
            fs.appendFileSync(agentPath, entry + '\n');
        }

        // Agent Activity — end event (Task subagent finished)
        if (data.hook_event_name === 'PostToolUse'
            && data.tool_name === 'Task'
            && typeof data.tool_use_id === 'string'
            && data.tool_use_id.length > 0) {
            const agentPath = getAgentActivityFilePath(sessionId);
            fs.mkdirSync(path.dirname(agentPath), { recursive: true });
            const entry = JSON.stringify({
                timestamp: new Date().toISOString(),
                session_id: sessionId,
                event: 'end',
                id: data.tool_use_id
            });
            fs.appendFileSync(agentPath, entry + '\n');
        }
    } catch { /* ignore parse errors */ }
    console.log('{}');
}

async function main() {
    // Parse --config before anything else
    initConfigPath(parseConfigArg());

    // Handle --hook mode (cross-platform hook handler for widgets)
    if (process.argv.includes('--hook')) {
        await handleHook();
        return;
    }

    // Check if we're in a piped/non-TTY environment first
    if (!process.stdin.isTTY) {
        await ensureWindowsUtf8CodePage();

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