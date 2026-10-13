import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { RenderContext } from '../../types/RenderContext';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { GitConflictsWidget } from '../../widgets/GitConflicts';
import {
    clearGitCache,
    getGitConflictCount
} from '../git';

const tempPaths: string[] = [];
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

function useTempHome(): string {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-home-'));
    tempPaths.push(home);
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    vi.spyOn(os, 'homedir').mockReturnValue(home);
    return home;
}

afterEach(() => {
    clearGitCache();
    vi.restoreAllMocks();
    if (ORIGINAL_HOME === undefined) {
        delete process.env.HOME;
    } else {
        process.env.HOME = ORIGINAL_HOME;
    }
    if (ORIGINAL_USERPROFILE === undefined) {
        delete process.env.USERPROFILE;
    } else {
        process.env.USERPROFILE = ORIGINAL_USERPROFILE;
    }
    for (const tempPath of tempPaths.splice(0)) {
        fs.rmSync(tempPath, { recursive: true, force: true });
        expect(fs.existsSync(tempPath)).toBe(false);
    }
});

describe('getGitConflictCount with a real index', () => {
    it.each([
        ['a b.txt', 'a  b.txt'],
        ['single.txt'],
        ['tab\tname.txt', 'line\nname.txt', ' leading.txt', 'trailing.txt ', 'dir/file.txt']
    ])('counts exact filenames and deduplicates stages: %j', (...filenames: string[]) => {
        const home = useTempHome();
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-git-conflicts-'));
        tempPaths.push(root);
        const git = (args: string[], input?: string) => execFileSync('git', args, {
            cwd: root,
            encoding: 'utf8',
            input,
            env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: '1' }
        });
        git(['init', '--quiet']);
        const hash = git(['hash-object', '-w', '--stdin'], 'conflict\n').trim();
        const records = [...filenames].sort().flatMap(filename => [1, 2, 3].map(stage => `100644 ${hash} ${stage}\t${filename}\0`));
        git(['update-index', '-z', '--index-info'], records.join(''));
        const output = git(['ls-files', '--unmerged', '-z']);
        expect(output).toBe(records.join(''));

        const context: RenderContext = { data: { cwd: root } };
        const count = getGitConflictCount(context);
        const rendered = new GitConflictsWidget().render(
            { id: 'conflicts', type: 'git-conflicts' }, context, DEFAULT_SETTINGS
        );
        expect({ count, rendered }).toEqual({ count: filenames.length, rendered: `⚠${filenames.length}` });
        const cacheDir = path.join(home, '.cache', 'ccstatusline', 'git-cache');
        const cacheFiles = fs.readdirSync(cacheDir);
        expect(cacheFiles).toHaveLength(1);
        const cache = JSON.parse(fs.readFileSync(path.join(cacheDir, cacheFiles[0] ?? ''), 'utf8')) as { cwd?: string };
        expect(cache.cwd).toBe(root);
    });
});
