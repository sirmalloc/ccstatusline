import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { __testing } from '../cache-dir';

// Root can write anywhere, and Windows ignores the read-only mode on folders
const canMakeReadOnly = process.platform !== 'win32' && process.getuid?.() !== 0;

describe('writable cache folder', () => {
    let tempRoot = '';
    let home = '';
    let tmpDir = '';
    let userCacheDir = '';
    let preferredDir = '';
    let fallbackDir = '';

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-cache-dir-test-'));
        home = path.join(tempRoot, 'home');
        tmpDir = path.join(tempRoot, 'tmp');
        userCacheDir = path.join(home, '.cache');
        preferredDir = path.join(userCacheDir, 'ccstatusline');
        fallbackDir = path.join(tmpDir, `ccstatusline-${process.getuid?.()}`);
        fs.mkdirSync(home);
        fs.mkdirSync(tmpDir);
    });

    afterEach(() => {
        if (fs.existsSync(userCacheDir)) {
            fs.chmodSync(userCacheDir, 0o755);
        }
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    function makeUserCacheReadOnly(): void {
        fs.mkdirSync(userCacheDir);
        fs.chmodSync(userCacheDir, 0o555);
    }

    it('uses ~/.cache/ccstatusline, creating it', () => {
        expect(__testing.resolveWritableCacheDir(home, tmpDir)).toBe(preferredDir);
        expect(fs.statSync(preferredDir).isDirectory()).toBe(true);
        expect(fs.existsSync(fallbackDir)).toBe(false);
    });

    it.skipIf(!canMakeReadOnly)('falls back to a folder only this account can use when ~/.cache cannot be written', () => {
        makeUserCacheReadOnly();

        expect(__testing.resolveWritableCacheDir(home, tmpDir)).toBe(fallbackDir);
        expect(fs.statSync(fallbackDir).mode & 0o777).toBe(0o700);
    });

    it.skipIf(!canMakeReadOnly)('reuses the fallback folder a previous render created', () => {
        makeUserCacheReadOnly();
        fs.mkdirSync(fallbackDir, { mode: 0o700 });
        fs.writeFileSync(path.join(fallbackDir, 'usage.lock'), '{}');

        expect(__testing.resolveWritableCacheDir(home, tmpDir)).toBe(fallbackDir);
        expect(fs.readdirSync(fallbackDir)).toEqual(['usage.lock']);
    });

    // Another account could put made-up usage data or backoff locks there
    it.skipIf(!canMakeReadOnly).each([
        {
            name: 'a folder other accounts can write to',
            create: () => {
                fs.mkdirSync(fallbackDir);
                fs.chmodSync(fallbackDir, 0o777);
            }
        },
        {
            name: 'a link to another folder',
            create: () => {
                const target = path.join(tempRoot, 'elsewhere');
                fs.mkdirSync(target, { mode: 0o700 });
                fs.symlinkSync(target, fallbackDir);
            }
        }
    ])('passes over a fallback that is $name', ({ create }) => {
        makeUserCacheReadOnly();
        create();

        expect(__testing.resolveWritableCacheDir(home, tmpDir)).toBe(preferredDir);
    });
});
