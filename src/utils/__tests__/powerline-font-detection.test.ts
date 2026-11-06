import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { fontFolderHasPowerlineFont } from '../powerline';

// Font detection used to scan only the top level of the font folders and to
// require a spaced "nerd font", so Nerd Fonts v3 layouts were reported as
// missing: files named without spaces ("JetBrainsMonoNerdFont-Regular.ttf"),
// the short "NF" form ("JetBrainsMonoNF-Regular.ttf"), and fonts nested in
// subfolders ("NerdFonts/...", Debian's
// /usr/share/fonts/opentype/PowerlineSymbols.otf).

describe('fontFolderHasPowerlineFont: Nerd Fonts v3 layouts', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'ccstatusline-font-detection-'));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    const writeFile = (relativePath: string): void => {
        const filePath = join(root, relativePath);
        mkdirSync(join(filePath, '..'), { recursive: true });
        writeFileSync(filePath, 'font data');
    };

    it('detects a spaceless v3 font name in the top-level font folder', () => {
        writeFile('JetBrainsMonoNerdFont-Regular.ttf');

        expect(fontFolderHasPowerlineFont(root)).toBe(true);
    });

    it('detects a font nested in a subfolder', () => {
        writeFile('NerdFonts/JetBrainsMonoNerdFont-Regular.ttf');

        expect(fontFolderHasPowerlineFont(root)).toBe(true);
    });

    it('detects the short NF form', () => {
        writeFile('JetBrainsMonoNF-Regular.ttf');

        expect(fontFolderHasPowerlineFont(root)).toBe(true);
    });

    it('still detects the spaced v2 name', () => {
        writeFile('JetBrains Mono Regular Nerd Font Complete.ttf');

        expect(fontFolderHasPowerlineFont(root)).toBe(true);
    });

    it('detects the Debian PowerlineSymbols.otf in a subfolder', () => {
        writeFile('opentype/PowerlineSymbols.otf');

        expect(fontFolderHasPowerlineFont(root)).toBe(true);
    });

    it('ignores fonts in hidden subfolders', () => {
        writeFile('.hidden/JetBrainsMonoNerdFont-Regular.ttf');

        expect(fontFolderHasPowerlineFont(root)).toBe(false);
    });

    it('reports missing when only unrelated fonts are installed', () => {
        writeFile('Arial.ttf');
        writeFile('SomeFont-Bold.otf');

        expect(fontFolderHasPowerlineFont(root)).toBe(false);
    });

    it('reports missing for an empty folder', () => {
        expect(fontFolderHasPowerlineFont(root)).toBe(false);
    });
});
