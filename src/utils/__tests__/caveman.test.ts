import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { getCavemanStatus } from '../caveman';

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
let testClaudeConfigDir = '';
const PICK = String.fromCodePoint(0x26cf);
const ESC = String.fromCharCode(0x1b);

function writeActiveFlag(content: string): void {
    fs.writeFileSync(path.join(testClaudeConfigDir, '.caveman-active'), content, 'utf-8');
}

function writeSavingsFile(content: string): void {
    fs.writeFileSync(path.join(testClaudeConfigDir, '.caveman-statusline-suffix'), content, 'utf-8');
}

beforeEach(() => {
    testClaudeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-caveman-'));
    process.env.CLAUDE_CONFIG_DIR = testClaudeConfigDir;
});

afterEach(() => {
    if (testClaudeConfigDir) {
        fs.rmSync(testClaudeConfigDir, { recursive: true, force: true });
    }
    if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
    } else {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
    }
});

describe('getCavemanStatus', () => {
    it('returns null when .caveman-active is absent', () => {
        expect(getCavemanStatus()).toBeNull();
    });

    it('returns null when .caveman-active is a symlink', () => {
        const realFile = path.join(testClaudeConfigDir, 'real-active');
        fs.writeFileSync(realFile, 'ultra', 'utf-8');
        fs.symlinkSync(realFile, path.join(testClaudeConfigDir, '.caveman-active'));

        expect(getCavemanStatus()).toBeNull();
    });

    it('lowercases and strips a trailing newline for a whitelisted mode', () => {
        writeActiveFlag('ULTRA\n');
        expect(getCavemanStatus()).toEqual({ mode: 'ultra', savings: null });
    });

    it('returns null for non-whitelisted content', () => {
        writeActiveFlag('hacked');
        expect(getCavemanStatus()).toBeNull();
    });

    it('returns null for content containing ANSI-escape bytes', () => {
        writeActiveFlag(`${ESC}[31multra${ESC}[0m`);
        expect(getCavemanStatus()).toBeNull();
    });

    it('caps the read at 64 bytes and does not crash on an oversized file', () => {
        writeActiveFlag(`ultra${'x'.repeat(200)}`);
        expect(getCavemanStatus()).toBeNull();
    });

    describe('savings suffix', () => {
        beforeEach(() => {
            writeActiveFlag('ultra');
        });

        it('is null when the suffix file is absent', () => {
            expect(getCavemanStatus()).toEqual({ mode: 'ultra', savings: null });
        });

        it('is null when the suffix file is a symlink', () => {
            const realFile = path.join(testClaudeConfigDir, 'real-suffix');
            fs.writeFileSync(realFile, `${PICK}  12.4k`, 'utf-8');
            fs.symlinkSync(realFile, path.join(testClaudeConfigDir, '.caveman-statusline-suffix'));

            expect(getCavemanStatus()).toEqual({ mode: 'ultra', savings: null });
        });

        it('strips control bytes from the suffix', () => {
            writeSavingsFile(`${PICK}  12.4k${ESC}[0m`);
            expect(getCavemanStatus()).toEqual({ mode: 'ultra', savings: `${PICK}  12.4k[0m` });
        });

        it('is null when the suffix is empty after stripping control bytes', () => {
            writeSavingsFile(ESC);
            expect(getCavemanStatus()).toEqual({ mode: 'ultra', savings: null });
        });

        it('returns the pre-rendered savings string on the happy path', () => {
            writeSavingsFile(`${PICK}  12.4k`);
            expect(getCavemanStatus()).toEqual({ mode: 'ultra', savings: `${PICK}  12.4k` });
        });

        it('caps the suffix read at 64 bytes on an oversized file', () => {
            writeSavingsFile('a'.repeat(100));
            const status = getCavemanStatus();
            expect(status?.savings).toHaveLength(64);
        });
    });
});
