import type * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it
} from 'vitest';

// Other suites mock child_process globally under Bun. Use real Git for fixture
// setup and a bundled subprocess for the helper and widget under test.
const require = createRequire(import.meta.url);
const { execFileSync } = require('node:child_process') as typeof childProcess;
const tempPaths: string[] = [];
let bundleDir = '';
let probePath = '';

beforeAll(() => {
    bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-conflicts-probe-'));
    const entryPath = path.join(bundleDir, 'probe.ts');
    probePath = path.join(bundleDir, 'probe.mjs');
    const modulePath = (relative: string) => JSON.stringify(fileURLToPath(new URL(relative, import.meta.url)));
    fs.writeFileSync(entryPath, `
        import { getGitConflictCount } from ${modulePath('../git.ts')};
        import { GitConflictsWidget } from ${modulePath('../../widgets/GitConflicts.ts')};
        import { DEFAULT_SETTINGS } from ${modulePath('../../types/Settings.ts')};
        const context = { data: { cwd: process.argv[2] } };
        const count = getGitConflictCount(context);
        const rendered = new GitConflictsWidget().render(
            { id: 'conflicts', type: 'git-conflicts' }, context, DEFAULT_SETTINGS
        );
        console.log(JSON.stringify({ count, rendered }));
    `);
    execFileSync('bun', ['build', entryPath, '--target=node', `--outfile=${probePath}`], { stdio: 'pipe' });
});

afterAll(() => {
    if (bundleDir) {
        fs.rmSync(bundleDir, { recursive: true, force: true });
        expect(fs.existsSync(bundleDir)).toBe(false);
    }
});

afterEach(() => {
    for (const tempPath of tempPaths.splice(0)) {
        fs.rmSync(tempPath, { recursive: true, force: true });
        expect(fs.existsSync(tempPath)).toBe(false);
    }
});

describe('getGitConflictCount with a real index', () => {
    it.each([
        { name: 'repeated spaces', filenames: ['a b.txt', 'a  b.txt'].map(name => Buffer.from(name)) },
        { name: 'single file', filenames: [Buffer.from('single.txt')] },
        {
            name: 'whitespace and directory paths',
            filenames: ['tab\tname.txt', 'line\nname.txt', ' leading.txt', 'trailing.txt ', 'dir/file.txt'].map(name => Buffer.from(name))
        },
        {
            name: 'distinct non-UTF-8 bytes and a literal replacement character',
            filenames: [Buffer.from('file-\xfe.txt', 'latin1'), Buffer.from('file-\xff.txt', 'latin1'), Buffer.from('file-\ufffd.txt')]
        }
    ])('counts exact filenames and deduplicates stages: $name', ({ filenames }) => {
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-home-'));
        tempPaths.push(home);
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-conflicts-'));
        tempPaths.push(root);
        const env = {
            ...process.env,
            HOME: home,
            USERPROFILE: home,
            GIT_CONFIG_GLOBAL: os.devNull,
            GIT_CONFIG_NOSYSTEM: '1'
        };
        const git = (args: string[], input?: string | Buffer) => execFileSync('git', args, {
            cwd: root,
            encoding: 'utf8',
            input,
            env
        });
        git(['init', '--quiet']);
        const hash = git(['hash-object', '-w', '--stdin'], 'conflict\n').trim();
        const records = Buffer.concat([...filenames].sort((a, b) => Buffer.compare(a, b)).flatMap(filename => [1, 2, 3].map(stage => Buffer.concat([
            Buffer.from(`100644 ${hash} ${stage}\t`), filename, Buffer.from([0])
        ]))));
        git(['update-index', '-z', '--index-info'], records);
        const output = execFileSync('git', ['ls-files', '--unmerged', '-z'], { cwd: root, env });
        expect(output).toEqual(records);

        const result: unknown = JSON.parse(execFileSync(process.execPath, [probePath, root], { encoding: 'utf8', env }));
        expect(result).toEqual({ count: filenames.length, rendered: `⚠${filenames.length}` });
        // A fresh process must also preserve the filenames through the JSON cache.
        const cachedResult: unknown = JSON.parse(execFileSync(process.execPath, [probePath, root], { encoding: 'utf8', env }));
        expect(cachedResult).toEqual(result);
        const cacheDir = path.join(home, '.cache', 'ccstatusline', 'git-cache');
        const cacheFiles = fs.readdirSync(cacheDir);
        expect(cacheFiles).toHaveLength(1);
        const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, cacheFiles[0] ?? ''), 'utf8')) as { cwd?: string };
        expect(cache.cwd).toBe(root);
    });
});
