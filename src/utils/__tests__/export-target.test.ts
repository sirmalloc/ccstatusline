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

import {
    getExportConfirmMessage,
    getExportTargetStatus,
    validateExportFileName,
    withJsonExtension
} from '../export-target';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ccsl-export-target-')));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('withJsonExtension', () => {
    it('appends .json when missing', () => {
        expect(withJsonExtension('cfg')).toBe('cfg.json');
        expect(withJsonExtension('cfg.txt')).toBe('cfg.txt.json');
    });

    it('keeps an existing .json suffix, case-insensitively', () => {
        expect(withJsonExtension('cfg.json')).toBe('cfg.json');
        expect(withJsonExtension('CFG.JSON')).toBe('CFG.JSON');
    });
});

describe('validateExportFileName', () => {
    it('rejects empty and whitespace-only names', () => {
        expect(validateExportFileName('')).toEqual({ ok: false, error: 'File name cannot be empty' });
        expect(validateExportFileName('   ').ok).toBe(false);
    });

    it('rejects path separators', () => {
        expect(validateExportFileName('a/b').ok).toBe(false);
        expect(validateExportFileName('a\\b').ok).toBe(false);
    });

    it('rejects . and ..', () => {
        expect(validateExportFileName('.').ok).toBe(false);
        expect(validateExportFileName('..').ok).toBe(false);
    });

    it('rejects NUL bytes and overlong names', () => {
        expect(validateExportFileName('a\0b').ok).toBe(false);
        expect(validateExportFileName('x'.repeat(251)).ok).toBe(false);
        expect(validateExportFileName('x'.repeat(250)).ok).toBe(true);
    });

    it('trims and appends .json', () => {
        expect(validateExportFileName('  cfg  ')).toEqual({ ok: true, fileName: 'cfg.json' });
        expect(validateExportFileName('cfg.json')).toEqual({ ok: true, fileName: 'cfg.json' });
    });
});

describe('getExportTargetStatus', () => {
    it('returns ok for a new file in an existing folder', () => {
        expect(getExportTargetStatus(path.join(tmpDir, 'new.json'))).toBe('ok');
    });

    it('returns exists for an existing file', () => {
        const file = path.join(tmpDir, 'a.json');
        fs.writeFileSync(file, '{}');
        expect(getExportTargetStatus(file)).toBe('exists');
    });

    it('returns missing-dir when the parent folder is absent', () => {
        expect(getExportTargetStatus(path.join(tmpDir, 'nope', 'x.json'))).toBe('missing-dir');
    });

    it('returns is-directory when the target is a folder', () => {
        fs.mkdirSync(path.join(tmpDir, 'd.json'));
        expect(getExportTargetStatus(path.join(tmpDir, 'd.json'))).toBe('is-directory');
    });

    it('returns parent-not-directory when the parent is a file', () => {
        const file = path.join(tmpDir, 'f');
        fs.writeFileSync(file, 'x');
        expect(getExportTargetStatus(path.join(file, 'x.json'))).toBe('parent-not-directory');
    });

    it('returns not-regular for a dangling symlink', () => {
        const link = path.join(tmpDir, 'link.json');
        fs.symlinkSync(path.join(tmpDir, 'missing-target.json'), link);
        expect(getExportTargetStatus(link)).toBe('not-regular');
    });

    it('returns exists for a symlink to a regular file', () => {
        const file = path.join(tmpDir, 'real.json');
        fs.writeFileSync(file, '{}');
        const link = path.join(tmpDir, 'alias.json');
        fs.symlinkSync(file, link);
        expect(getExportTargetStatus(link)).toBe('exists');
    });

    it('does not create anything', () => {
        getExportTargetStatus(path.join(tmpDir, 'nope', 'x.json'));
        expect(fs.existsSync(path.join(tmpDir, 'nope'))).toBe(false);
    });
});

describe('getExportConfirmMessage', () => {
    it('builds the overwrite message', () => {
        expect(getExportConfirmMessage('exists', '/a/b.json')).toBe('File already exists:\n/a/b.json\n\nOverwrite it?');
    });

    it('names the real file when the target is a symlink', () => {
        const file = path.join(tmpDir, 'real.json');
        fs.writeFileSync(file, '{}');
        const link = path.join(tmpDir, 'alias.json');
        fs.symlinkSync(file, link);
        expect(getExportConfirmMessage('exists', link)).toContain(`(symlink to ${file})`);
    });

    it('builds the create-folder message using the parent folder', () => {
        expect(getExportConfirmMessage('missing-dir', '/a/new/b.json')).toBe('Folder does not exist:\n/a/new\n\nCreate it and export?');
    });
});
