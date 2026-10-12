import { spawnSync } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync
} from 'node:fs';
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

interface BunSpawnResult {
    exitCode: number | null;
    stdout: Buffer;
    stderr: Buffer;
}

interface BunRuntime { spawnSync(command: string[], options: { env: NodeJS.ProcessEnv; stdout: 'pipe'; stderr: 'pipe' }): BunSpawnResult }

// Other suites mock node:child_process and that mock leaks across files under
// the bun runner (deterministically on Linux CI), so subprocesses are spawned
// through Bun.spawnSync there; vitest/Node keeps test files isolated and takes
// the real spawnSync.
function runProcess(command: string, args: string[], options: { env?: NodeJS.ProcessEnv }): string {
    const bun = (globalThis as { Bun?: BunRuntime }).Bun;

    if (bun) {
        const result = bun.spawnSync([command, ...args], {
            env: options.env ?? process.env,
            stdout: 'pipe',
            stderr: 'pipe'
        });
        if (result.exitCode !== 0) {
            throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr.toString().slice(0, 400)}`);
        }
        return result.stdout.toString();
    }

    const result = spawnSync(command, args, { env: options.env, encoding: 'utf8' });
    if (result.error !== undefined) {
        throw result.error;
    }
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr.slice(0, 400)}`);
    }
    return result.stdout;
}

// Upstream 75f07d6: the skills hook and the Skills widget build the log path
// from the payload's session_id. An id containing `/` or `..` named a file
// outside ~/.cache/ccstatusline/skills: the hook appended to it and the
// widget read it. Session ids are UUIDs, so only [A-Za-z0-9_-] get a log.

let workDir = '';
let probeHome = '';
let probeBundle = '';

const probeSource = `
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as skillsModule from ${JSON.stringify(fileURLToPath(new URL('../skills.ts', import.meta.url)))};
import * as hookModule from ${JSON.stringify(fileURLToPath(new URL('../hook-handler.ts', import.meta.url)))};

const [command, argument] = process.argv.slice(2);
if (command === 'path') {
    process.stdout.write(JSON.stringify({ skillsPath: skillsModule.getSkillsFilePath(argument) }));
} else if (command === 'hook') {
    hookModule.handleHookInput(JSON.stringify({
        session_id: argument,
        hook_event_name: 'PreToolUse',
        tool_name: 'Skill',
        tool_input: { skill: 'commit' }
    }));
    process.stdout.write(JSON.stringify({
        escapedFile: fs.existsSync(path.join(os.homedir(), '.cache', 'escape.jsonl')),
        ccstatuslineDir: fs.existsSync(path.join(os.homedir(), '.cache', 'ccstatusline'))
    }));
}
`;

function runProbe(command: string, argument: string): Record<string, unknown> {
    // node, not bun: node's os.homedir() honors HOME, keeping every cache
    // write inside the temp home
    const output = runProcess('node', [probeBundle, command, argument], { env: { ...process.env, HOME: probeHome, USERPROFILE: probeHome } });
    return JSON.parse(output) as Record<string, unknown>;
}

describe('upstream 75f07d6: the skills log stays inside the skills folder', () => {
    beforeEach(() => {
        workDir = mkdtempSync(path.join(os.tmpdir(), 'ccsl-skills-path-'));
        probeHome = path.join(workDir, 'home');
        mkdirSync(probeHome, { recursive: true });
        const entry = path.join(workDir, 'probe-skills.mjs');
        writeFileSync(entry, probeSource);
        probeBundle = path.join(workDir, 'probe-skills.bundle.mjs');
        runProcess('bun', ['build', entry, '--outfile', probeBundle, '--target=node'], { env: { ...process.env } });
    });

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true });
    });

    it('returns the log path for a UUID session id', () => {
        const result = runProbe('path', '8b65639f-5819-44ad-86cc-12b684622a78');

        const skillsPath = result.skillsPath as string;
        expect(skillsPath).toContain('skills-8b65639f-5819-44ad-86cc-12b684622a78.jsonl');
        expect(skillsPath.startsWith(probeHome)).toBe(true);
    });

    it.each([
        'x/../../outside',
        '../outside',
        'a/b',
        '..',
        '',
        'with space',
        'a\\b'
    ])('has no log path for the session id %j', (sessionId) => {
        const result = runProbe('path', sessionId);

        expect(result.skillsPath).toBeNull();
    });

    it('writes nothing when a hook passes a traversal session id', () => {
        const result = runProbe('hook', 'x/../../../escape');

        expect(result.escapedFile).toBe(false);
        expect(result.ccstatuslineDir).toBe(false);
    });
});
