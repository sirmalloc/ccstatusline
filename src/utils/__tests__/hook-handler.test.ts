import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type MockInstance
} from 'vitest';

import { handleHookInput } from '../hook-handler';
import { getSkillsFilePath } from '../skills';

let testHomeDir = '';
let consoleLogSpy: MockInstance<typeof console.log>;

function readSkillsLog(sessionId: string): Record<string, unknown>[] {
    const skillsPath = getSkillsFilePath(sessionId);
    if (!skillsPath) {
        throw new Error(`no skills log for ${sessionId}`);
    }
    return fs.readFileSync(skillsPath, 'utf-8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line) as Record<string, unknown>);
}

describe('handleHookInput', () => {
    beforeEach(() => {
        testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-hook-handler-'));
        vi.spyOn(os, 'homedir').mockReturnValue(testHomeDir);
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (testHomeDir) {
            fs.rmSync(testHomeDir, { recursive: true, force: true });
        }
    });

    it('does not write stdout for no-op hook inputs', () => {
        handleHookInput(null);
        handleHookInput('{ invalid json');
        handleHookInput(JSON.stringify({ hook_event_name: 'PreToolUse' }));
        handleHookInput(JSON.stringify({ session_id: 'session-1', hook_event_name: 'PreToolUse' }));

        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(fs.existsSync(path.join(testHomeDir, '.cache', 'ccstatusline'))).toBe(false);
    });

    it('writes nothing for a session id that would leave the skills folder', () => {
        handleHookInput(JSON.stringify({
            session_id: 'x/../../../escape',
            hook_event_name: 'PreToolUse',
            tool_name: 'Skill',
            tool_input: { skill: 'commit' }
        }));

        expect(fs.existsSync(path.join(testHomeDir, '.cache', 'escape.jsonl'))).toBe(false);
        expect(fs.existsSync(path.join(testHomeDir, '.cache', 'ccstatusline'))).toBe(false);
    });

    it('records PreToolUse skill hooks without writing stdout', () => {
        handleHookInput(JSON.stringify({
            session_id: 'session-1',
            hook_event_name: 'PreToolUse',
            tool_name: 'Skill',
            tool_input: { skill: 'review-pr' }
        }));

        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(readSkillsLog('session-1')).toMatchObject([
            {
                session_id: 'session-1',
                skill: 'review-pr',
                source: 'PreToolUse'
            }
        ]);
    });

    it('records slash command UserPromptSubmit hooks without writing stdout', () => {
        handleHookInput(JSON.stringify({
            session_id: 'session-1',
            hook_event_name: 'UserPromptSubmit',
            prompt: '/commit staged changes'
        }));

        expect(consoleLogSpy).not.toHaveBeenCalled();
        expect(readSkillsLog('session-1')).toMatchObject([
            {
                session_id: 'session-1',
                skill: 'commit',
                source: 'UserPromptSubmit'
            }
        ]);
    });
});
