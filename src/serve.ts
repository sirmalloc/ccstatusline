import * as readline from 'node:readline';

import { renderStatusLines } from './render';
import type { RenderInvocation } from './types/RenderContext';
import type { StatusJSON } from './types/StatusJSON';
import { StatusJSONSchema } from './types/StatusJSON';
import type { LoadedSettings } from './utils/config';
import {
    getConfigPath,
    loadSettingsFrom
} from './utils/config';
import {
    getTerminalWidth,
    resetTerminalWidthCache
} from './utils/terminal';

// Dependencies of the serve loop, injectable so tests can run hermetically
// (fixed settings, no terminal probe) while production wires process state.
export interface ServeDependencies {
    loadSettings: () => Promise<LoadedSettings>;
    resolveTerminalWidth: (sessionId: string | undefined, ttlSeconds: number) => number | null;
    buildInvocation: (terminalWidth: number | null) => RenderInvocation;
}

export function createProcessServeDependencies(): ServeDependencies {
    return {
        loadSettings: () => loadSettingsFrom(getConfigPath()),
        resolveTerminalWidth: (sessionId, ttlSeconds) => {
            // A long-lived serve process must re-probe per request: the width
            // memo is process-global, so a terminal resize after the first
            // request would serve the stale width forever, ttl or not.
            resetTerminalWidthCache();
            return getTerminalWidth({ sessionId, ttlSeconds });
        },
        buildInvocation: terminalWidth => ({
            configPath: getConfigPath(),
            cwd: process.cwd(),
            env: { ...process.env },
            terminalWidth
        })
    };
}

/**
 * Handle one newline-delimited request of the serve loop (#14): parse the
 * payload, render through the request-scoped orchestration (#15), and return
 * one JSON response line. Blank input lines return '' (no response); parse or
 * validation failures return {"error": ...} instead of killing the process, so
 * one bad session cannot take down the shared runner.
 */
export async function handleServeLine(line: string, deps: ServeDependencies): Promise<string> {
    const trimmed = line.trim();
    if (trimmed === '') {
        return '';
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (error) {
        return JSON.stringify({ error: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` });
    }

    const result = StatusJSONSchema.safeParse(parsed);
    if (!result.success) {
        return JSON.stringify({ error: `invalid status JSON: ${result.error.message}` });
    }

    try {
        const data: StatusJSON = result.data;
        const loaded = await deps.loadSettings();
        const terminalWidth = deps.resolveTerminalWidth(data.session_id, loaded.settings.terminalWidthCacheTtlSeconds);
        const { text } = await renderStatusLines(data, loaded, deps.buildInvocation(terminalWidth));
        return JSON.stringify({ text });
    } catch (error) {
        return JSON.stringify({ error: `render failed: ${error instanceof Error ? error.message : String(error)}` });
    }
}

/**
 * Long-lived serve mode (--serve): NDJSON requests on stdin (one status JSON
 * payload per line), one JSON response line per request on stdout. The process
 * stays alive across requests, so module loading, startup I/O, and code are
 * paid once instead of per repaint.
 */
export async function runServeLoop(deps: ServeDependencies = createProcessServeDependencies()): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin });
    for await (const line of rl) {
        const response = await handleServeLine(line, deps);
        if (response !== '') {
            console.log(response);
        }
    }
}
