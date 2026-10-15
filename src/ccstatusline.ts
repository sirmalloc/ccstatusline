#!/usr/bin/env node
import { existsSync } from 'fs';

import { renderStatusLines } from './render';
import { runServeLoop } from './serve';
import type { StatusJSON } from './types/StatusJSON';
import { StatusJSONSchema } from './types/StatusJSON';
import {
    isCliMode,
    runCli
} from './utils/cli';
import {
    getConfigPath,
    initConfigPath,
    loadSettings,
    loadSettingsFrom,
    saveSettings
} from './utils/config';
import {
    GIT_REVIEW_REFRESH_FLAG,
    refreshGitReviewCacheFromCli
} from './utils/git-review-cache';
import { handleHookInput } from './utils/hook-handler';
import {
    getPackageVersion,
    getTerminalWidth
} from './utils/terminal';

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
        execFileSync('chcp.com', ['65001'], { stdio: 'ignore', windowsHide: true });
    } catch {
        // Ignore failures to preserve statusline output even in restricted shells.
    }
}

// Snapshot everything the render needs from this process (#15): one invocation
// context per request, so the shared-process runner can vary these per request.
function createInvocationFromProcess(terminalWidth: number | null) {
    return {
        configPath: getConfigPath(),
        cwd: process.cwd(),
        env: { ...process.env },
        terminalWidth
    };
}

async function renderMultipleLines(data: StatusJSON) {
    const loaded = await loadSettingsFrom(getConfigPath());

    // Terminal width is resolved once per request from process state (memoized
    // probe + session L2 cache) and passed into the render explicitly.
    const terminalWidth = getTerminalWidth({
        sessionId: data.session_id,
        ttlSeconds: loaded.settings.terminalWidthCacheTtlSeconds
    });

    const { text } = await renderStatusLines(data, loaded, createInvocationFromProcess(terminalWidth));
    if (text !== '') {
        console.log(text);
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

async function handleHook(): Promise<void> {
    const input = await readStdin();
    handleHookInput(input);
}

function handleGitReviewRefresh(): boolean {
    const flagIndex = process.argv.indexOf(GIT_REVIEW_REFRESH_FLAG);
    if (flagIndex === -1) {
        return false;
    }

    const cwd = process.argv[flagIndex + 1];
    const mode = process.argv[flagIndex + 2];
    const lockPath = process.argv[flagIndex + 3];
    if (!cwd || (mode !== 'metadata' && mode !== 'checks') || !lockPath) {
        return true;
    }

    refreshGitReviewCacheFromCli(cwd, { includeChecks: mode === 'checks' }, lockPath);
    return true;
}

async function main() {
    // Detached cache refreshes re-enter this executable without reading stdin
    // or loading user settings. This mode intentionally emits no output.
    if (handleGitReviewRefresh()) {
        return;
    }

    // Print version and exit (#461). Standard CLI behavior, runs before any other mode.
    if (process.argv.includes('--version')) {
        console.log(getPackageVersion());
        process.exit(0);
    }

    // Parse --config before anything else
    initConfigPath(parseConfigArg());

    // Handle --hook mode (cross-platform hook handler for widgets)
    if (process.argv.includes('--hook')) {
        await handleHook();
        return;
    }

    // Serve mode (#14): NDJSON requests on stdin, JSON responses on stdout,
    // one long-lived process instead of a process per repaint.
    if (process.argv.includes('--serve')) {
        await runServeLoop();
        return;
    }

    // Daemon modes (#16 transport, #17 lifecycle): the foreground server host
    // runs on `daemon serve`; `daemon start|stop|status|restart` coordinate
    // the shared background renderer. Checked before the TTY split like
    // --serve: the daemon is started detached, without a TTY and without a
    // piped payload. Imported lazily so the per-repaint render path never
    // loads node:http.
    if (process.argv.includes('daemon')) {
        const { runDaemonCommand } = await import('./daemon/lifecycle');
        await runDaemonCommand();
        return;
    }

    // Non-interactive CLI subcommands (#602): args present + TTY stdin means an
    // agent or human is configuring the tool, not rendering a status line.
    // Piped stdin (Claude Code) keeps the render path regardless of args.
    if (isCliMode(process.argv.slice(2), process.stdin.isTTY)) {
        await runCli(process.argv.slice(2));
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
        // First run = settings.json absent; must be captured before this
        // loadSettings() materializes the defaults on disk.
        const firstRun = !existsSync(getConfigPath());
        // Remove updatemessage before running TUI
        const settings = await loadSettings();
        if (settings.updatemessage) {
            const { updatemessage, ...newSettings } = settings;
            await saveSettings(newSettings);
        }
        // Imported lazily: the TUI pulls in ink/React/yoga-layout, which the
        // status line render path never touches. Claude Code re-runs this
        // binary every couple of seconds, so keeping that graph off the
        // render path is worth the dynamic import here.
        const { runTUI } = await import('./tui');
        runTUI(firstRun);
    }
}

void main();
