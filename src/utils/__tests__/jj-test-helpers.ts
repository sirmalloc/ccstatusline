import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    vi
} from 'vitest';

import { clearGitCache } from '../git';

export interface JjTestWorkspace {
    root: string;
    home: string;
    opHeadsPath: string;
    checkoutPath: string;
}

export function createJjWorkspace(parentDir: string): Omit<JjTestWorkspace, 'home'> {
    const root = fs.mkdtempSync(path.join(parentDir, 'jj-repo-'));
    const opHeadsPath = path.join(root, '.jj', 'repo', 'op_heads', 'heads');
    const checkoutPath = path.join(root, '.jj', 'working_copy', 'checkout');
    fs.mkdirSync(opHeadsPath, { recursive: true });
    fs.mkdirSync(path.dirname(checkoutPath), { recursive: true });
    fs.writeFileSync(checkoutPath, '', 'utf-8');
    return { root, opHeadsPath, checkoutPath };
}

// Registers hooks that give every test a fresh jj workspace (a `.jj`
// directory the repo walk can find) and an isolated HOME for the persistent
// command cache, and clear the in-process cache between tests.
export function useJjTestWorkspace(): JjTestWorkspace {
    const state = {} as JjTestWorkspace;
    let tempDir = '';

    beforeEach(() => {
        clearGitCache();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-jj-'));
        const home = path.join(tempDir, 'home');
        fs.mkdirSync(home);
        vi.spyOn(os, 'homedir').mockReturnValue(home);
        Object.assign(state, { home }, createJjWorkspace(tempDir));
    });

    afterEach(() => {
        clearGitCache();
        vi.restoreAllMocks();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    return state;
}
