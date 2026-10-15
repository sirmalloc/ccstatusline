import type * as childProcess from 'child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterAll,
    describe,
    expect,
    it
} from 'vitest';

// End-to-end smoke test: spawns the real CLI in piped mode against real git
// fixtures. Must run outside the test process because other suites mock
// child_process globally under Bun.
const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;

const ANSI_CODES = /\x1b\[[0-9;]*m/g;
// The renderer emits non-breaking spaces inside widget text; normalize them
// so plain-ASCII assertions stay readable.
const NBSP = new RegExp(String.fromCharCode(160), 'g');
const entryPath = fileURLToPath(new URL('../ccstatusline.ts', import.meta.url));
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-cli-smoke-'));
const tempHome = path.join(tempRoot, 'home');
const configPath = path.join(tempRoot, 'settings.json');
const transcriptPath = path.join(tempRoot, 'transcript.jsonl');

// Fixed minimal config so the smoke does not depend on the developer's live
// settings or on the default widget set.
fs.mkdirSync(tempHome, { recursive: true });
fs.writeFileSync(configPath, JSON.stringify({
    version: 4,
    lines: [[
        { id: 'smoke-branch', type: 'git-branch' },
        { id: 'smoke-changes', type: 'git-changes' },
        { id: 'smoke-ahead-behind', type: 'git-ahead-behind' }
    ]]
}), 'utf-8');
fs.writeFileSync(transcriptPath, '', 'utf-8');

function git(cwd: string, ...args: string[]): void {
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd,
        stdio: 'pipe'
    });
}

function initRepo(name: string): string {
    const repoPath = path.join(tempRoot, name);
    fs.mkdirSync(repoPath, { recursive: true });
    git(repoPath, 'init', '-b', 'main', '--quiet');
    git(repoPath, 'commit', '--allow-empty', '--quiet', '-m', 'init');
    return repoPath;
}

function createDivergedClone(): string {
    const originPath = initRepo('smoke-origin');
    const workPath = path.join(tempRoot, 'smoke-work');
    git(tempRoot, 'clone', '--quiet', originPath, workPath);
    git(workPath, 'commit', '--allow-empty', '--quiet', '-m', 'local');
    git(originPath, 'commit', '--allow-empty', '--quiet', '-m', 'remote');
    git(workPath, 'fetch', '--quiet', 'origin');
    return workPath;
}

function renderLine(cwd: string): string {
    const stdout = execFileSync('bun', [entryPath, '--config', configPath], {
        input: JSON.stringify({
            model: { id: 'claude-sonnet-4-5' },
            transcript_path: transcriptPath,
            cwd
        }),
        encoding: 'utf8',
        timeout: 20000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, HOME: tempHome, USERPROFILE: tempHome }
    });
    return stdout.replace(ANSI_CODES, '').replace(NBSP, ' ');
}

afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('CLI pipe smoke (spawned process, real git fixtures)', () => {
    it('renders the no-git state outside a repository', () => {
        expect(renderLine(tempRoot)).toContain('no git');
    });

    it('renders ahead and behind counts for a diverged branch', () => {
        const text = renderLine(createDivergedClone());
        expect(text).toContain('↑1');
        expect(text).toContain('↓1');
    });

    it('hides the zero state on a synced branch', () => {
        const originPath = initRepo('smoke-synced-origin');
        const clonePath = path.join(tempRoot, 'smoke-synced');
        git(tempRoot, 'clone', '--quiet', originPath, clonePath);
        expect(renderLine(clonePath)).not.toContain('↑0↓0');
    });

    it('renders the no-upstream state without an upstream', () => {
        expect(renderLine(initRepo('smoke-noupstream'))).toContain('(no upstream)');
    });
});
