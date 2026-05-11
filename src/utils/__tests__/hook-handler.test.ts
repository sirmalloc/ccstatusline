import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
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
    return fs.readFileSync(getSkillsFilePath(sessionId), 'utf-8')
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
