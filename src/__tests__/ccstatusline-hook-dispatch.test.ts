import type * as childProcess from 'child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

// ccstatusline.ts calls `void main()` at module load time (reads stdin,
// possibly launches the TUI), so it cannot be imported in-process like a
// library module. Run it as a real subprocess instead, the same way
// custom-command-process.test.ts exercises a CLI entry outside the test
// process's own module graph.
const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;
const entryPath = fileURLToPath(new URL('../ccstatusline.ts', import.meta.url));

let homeDir = '';

function readSkillsLog(sessionId: string): Record<string, unknown>[] {
    const logPath = path.join(homeDir, '.cache', 'ccstatusline', 'skills', `skills-${sessionId}.jsonl`);
    if (!fs.existsSync(logPath)) {
        return [];
    }
    return fs.readFileSync(logPath, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line) as Record<string, unknown>);
}

function runCli(args: string[], input: string): { stdout: string; stderr: string; status: number } {
    try {
        const stdout = execFileSync('bun', [entryPath, ...args], {
            input,
            encoding: 'utf8',
            env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir },
            timeout: 10_000
        });
        return { stdout, stderr: '', status: 0 };
    } catch (error) {
        const execError = error as childProcess.ExecFileException & { status?: number; stdout?: string; stderr?: string };
        return {
            stdout: execError.stdout ?? '',
            stderr: execError.stderr ?? '',
            status: execError.status ?? 1
        };
    }
}

// Issue #623: syncWidgetHooks() builds the configured hook command as
// `${statusCommand} --hook`. When statusCommand is itself a wrapped command
// (e.g. `bash -c '... ccstatusline'`), that concatenation puts --hook outside
// the wrapper's quotes, so when Claude Code executes the already-malformed
// configured command, the flag never reaches argv and a hook payload arrives
// on the piped-input path instead of through the explicit --hook branch.
//
// Skipped on win32: this spawns `bun` directly by name via execFileSync
// without `shell: true`. Elsewhere in this repo (global-command-resolution.ts)
// Windows executable resolution needs special-casing (e.g. `npm` -> `npm.cmd`),
// and there is no Windows runtime available here to confirm whether a bare
// `bun` invocation resolves the same way, so this is skipped out of caution
// rather than a confirmed platform limitation — not a claim that the
// underlying fix is POSIX-only.
describe.skipIf(process.platform === 'win32')('wrapped hook payload dispatch (issue #623)', () => {
    beforeEach(() => {
        homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-hook-dispatch-'));
    });

    afterEach(() => {
        fs.rmSync(homeDir, { recursive: true, force: true });
    });

    it('dispatches a PreToolUse payload that arrives without --hook and renders nothing', () => {
        const payload = JSON.stringify({
            session_id: 'wrapped-session-1',
            hook_event_name: 'PreToolUse',
            tool_name: 'Skill',
            tool_input: { skill: 'review-pr' }
        });

        const result = runCli([], payload);

        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
        expect(readSkillsLog('wrapped-session-1')).toMatchObject([
            { session_id: 'wrapped-session-1', skill: 'review-pr', source: 'PreToolUse' }
        ]);
    });

    it('dispatches a slash-command UserPromptSubmit payload that arrives without --hook', () => {
        const payload = JSON.stringify({
            session_id: 'wrapped-session-2',
            hook_event_name: 'UserPromptSubmit',
            prompt: '/commit staged changes'
        });

        const result = runCli([], payload);

        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
        expect(readSkillsLog('wrapped-session-2')).toMatchObject([
            { session_id: 'wrapped-session-2', skill: 'commit', source: 'UserPromptSubmit' }
        ]);
    });

    it('preserves explicit --hook mode unchanged', () => {
        const payload = JSON.stringify({
            session_id: 'explicit-hook-session',
            hook_event_name: 'PreToolUse',
            tool_name: 'Skill',
            tool_input: { skill: 'review-pr' }
        });

        const result = runCli(['--hook'], payload);

        expect(result.status).toBe(0);
        expect(result.stdout).toBe('');
        expect(readSkillsLog('explicit-hook-session')).toMatchObject([
            { session_id: 'explicit-hook-session', skill: 'review-pr', source: 'PreToolUse' }
        ]);
    });

    it('still renders ordinary status JSON unaffected by the new hook-envelope check', () => {
        const configPath = path.join(homeDir, 'ccstatusline-settings.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: 4,
            lines: [[{ id: '1', type: 'custom-text', customText: 'PROBE-OK' }], [], []]
        }));

        const payload = JSON.stringify({
            session_id: 'status-session',
            model: { id: 'claude-sonnet-4-5-20250929' }
        });

        const result = runCli(['--config', configPath], payload);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('PROBE-OK');
        expect(readSkillsLog('status-session')).toEqual([]);
    });

    it('does not hijack a status payload whose hook_event_name is not a dispatchable event', () => {
        const configPath = path.join(homeDir, 'ccstatusline-settings.json');
        fs.writeFileSync(configPath, JSON.stringify({
            version: 4,
            lines: [[{ id: '1', type: 'custom-text', customText: 'PROBE-OK' }], [], []]
        }));

        // Shares session_id/hook_event_name field names with a real hook
        // envelope, but the event isn't one handleHookInput acts on, so this
        // must still fall through to ordinary status rendering.
        const payload = JSON.stringify({
            session_id: 'status-session-2',
            hook_event_name: 'Stop',
            model: { id: 'claude-sonnet-4-5-20250929' }
        });

        const result = runCli(['--config', configPath], payload);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('PROBE-OK');
        expect(readSkillsLog('status-session-2')).toEqual([]);
    });

    it('still rejects malformed JSON with a non-zero exit', () => {
        const result = runCli([], '{ invalid json');

        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('Error parsing JSON');
    });
});
