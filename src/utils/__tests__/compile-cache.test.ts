import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import type { CompileCacheDeps } from '../compile-cache';
import {
    enableCompileCache,
    pruneOlderCompileCaches
} from '../compile-cache';

let home: string;
let root: string;

function makeDeps(overrides: Partial<CompileCacheDeps> = {}): CompileCacheDeps {
    return {
        enable: vi.fn(),
        isBun: false,
        homedir: () => home,
        version: '2.2.30',
        ...overrides
    };
}

function makeDirs(...names: string[]): void {
    for (const name of names) {
        fs.mkdirSync(path.join(root, name, 'entry'), { recursive: true });
    }
}

describe('compile cache', () => {
    beforeEach(() => {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-compile-cache-'));
        root = path.join(home, '.cache', 'ccstatusline', 'compile-cache');
    });

    afterEach(() => {
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('enables the cache in a per-version directory', () => {
        const deps = makeDeps();
        enableCompileCache(deps);
        expect(deps.enable).toHaveBeenCalledWith(path.join(root, '2.2.30'));
    });

    it('does nothing when the runtime has no compile cache API', () => {
        expect(() => { enableCompileCache(makeDeps({ enable: undefined })); }).not.toThrow();
    });

    it('does nothing on Bun', () => {
        const deps = makeDeps({ isBun: true });
        enableCompileCache(deps);
        expect(deps.enable).not.toHaveBeenCalled();
    });

    it('swallows errors from the runtime', () => {
        const deps = makeDeps({ enable: () => { throw new Error('EROFS'); } });
        expect(() => { enableCompileCache(deps); }).not.toThrow();
    });

    it('prunes older releases on the first run of a new one, keeping newer and unrelated entries', () => {
        makeDirs('2.2.9', '2.2.29', '2.3.0', '10.0.0', 'notes');
        enableCompileCache(makeDeps());
        expect(fs.readdirSync(root).sort()).toEqual(['10.0.0', '2.3.0', 'notes']);
    });

    it('does not scan for old releases once this release has a cache', () => {
        makeDirs('2.2.29', '2.2.30');
        enableCompileCache(makeDeps());
        expect(fs.readdirSync(root).sort()).toEqual(['2.2.29', '2.2.30']);
    });

    it('never prunes for an unreleased (unparseable) version', () => {
        makeDirs('2.2.29');
        pruneOlderCompileCaches(root, '__PACKAGE_VERSION__');
        expect(fs.readdirSync(root)).toEqual(['2.2.29']);
    });
});
