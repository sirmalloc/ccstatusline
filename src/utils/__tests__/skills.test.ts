import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    getSkillsFilePath,
    getSkillsMetrics
} from '../skills';

let testHomeDir = '';

function writeSkillsLog(sessionId: string, lines: string[]): void {
    const skillsPath = getSkillsFilePath(sessionId);
    if (!skillsPath) {
        throw new Error(`no skills log for ${sessionId}`);
    }
    fs.mkdirSync(path.dirname(skillsPath), { recursive: true });
    fs.writeFileSync(skillsPath, lines.join('\n'), 'utf-8');
}

describe('skills metrics', () => {
    beforeEach(() => {
        testHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-home-'));
        vi.spyOn(os, 'homedir').mockReturnValue(testHomeDir);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (testHomeDir) {
            fs.rmSync(testHomeDir, { recursive: true, force: true });
        }
    });

    it('uses ~/.cache/ccstatusline/skills path for skill logs', () => {
        expect(getSkillsFilePath('session-1')).toBe(
            path.join(testHomeDir, '.cache', 'ccstatusline', 'skills', 'skills-session-1.jsonl')
        );
    });

    // The session id comes from the hook and status payloads; a path in it must
    // not reach files outside the skills folder
    it.each(['x/../../outside', '../outside', 'a/b', '..', '', 'with space', 'a\\b'])('has no log path for the session id %j', (sessionId) => {
        expect(getSkillsFilePath(sessionId)).toBeNull();
    });

    it('reports no skills for a session id that would read outside the skills folder', () => {
        const outside = path.join(testHomeDir, '.cache', 'ccstatusline', 'outside.jsonl');
        fs.mkdirSync(path.dirname(outside), { recursive: true });
        fs.writeFileSync(outside, JSON.stringify({ skill: 'planted', session_id: 'x' }), 'utf-8');

        expect(getSkillsMetrics('x/../../outside')).toEqual({ totalInvocations: 0, uniqueSkills: [], lastSkill: null });
    });

    it('returns total, unique (most-recent-first), and last skill from a valid log', () => {
        writeSkillsLog('session-1', [
            JSON.stringify({ skill: 'commit', session_id: 'session-1' }),
            JSON.stringify({ skill: 'review-pr', session_id: 'session-1' }),
            JSON.stringify({ skill: 'lint', session_id: 'session-1' }),
            JSON.stringify({ skill: 'commit', session_id: 'session-1' })
        ]);

        expect(getSkillsMetrics('session-1')).toEqual({
            totalInvocations: 4,
            uniqueSkills: ['commit', 'lint', 'review-pr'],
            lastSkill: 'commit'
        });
    });
});
