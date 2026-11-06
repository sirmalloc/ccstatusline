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

import { replaceFileSync } from '../replace-file';

describe('replaceFileSync', () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-replace-file-'));
    });

    afterEach(() => {
        fs.chmodSync(dir, 0o700);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('creates a missing file', () => {
        const filePath = path.join(dir, 'state.json');

        replaceFileSync(filePath, '{"a":1}');

        expect(fs.readFileSync(filePath, 'utf8')).toBe('{"a":1}');
        expect(fs.readdirSync(dir)).toEqual(['state.json']);
    });

    it.skipIf(process.platform === 'win32')('replaces a read-only file in a folder that can be written', () => {
        const filePath = path.join(dir, 'state.json');
        fs.writeFileSync(filePath, 'old');
        fs.chmodSync(filePath, 0o444);

        replaceFileSync(filePath, 'new');

        expect(fs.readFileSync(filePath, 'utf8')).toBe('new');
        expect(fs.readdirSync(dir)).toEqual(['state.json']);
    });

    it.skipIf(process.platform === 'win32')('writes a writable file in place when its folder cannot be written', () => {
        const filePath = path.join(dir, 'state.json');
        fs.writeFileSync(filePath, 'old');
        fs.chmodSync(dir, 0o555);

        replaceFileSync(filePath, 'new');

        expect(fs.readFileSync(filePath, 'utf8')).toBe('new');
        expect(fs.readdirSync(dir)).toEqual(['state.json']);
    });

    it('throws, leaving no temp file, when the file can be written neither way', () => {
        const filePath = path.join(dir, 'state.json');
        fs.mkdirSync(filePath);

        expect(() => { replaceFileSync(filePath, 'new'); }).toThrow();
        expect(fs.readdirSync(dir)).toEqual(['state.json']);
    });
});
