import * as fs from 'fs';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { TipFile } from '../../types/TipData';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import { createTipsTmpDir, makeTipFile, tipsSettings } from '../../test-helpers/tips';
import {
    advanceTipRotation,
    checkVersionAndGenerateTips,
    cleanupExpiredTipFiles,
    compareSemver,
    fetchChangelog,
    generateTips,
    getLatestTipFile,
    getMergedTipPool,
    getTipIndexPath,
    getTipsDir,
    getLastVersionPath,
    listValidTipFiles,
    readLastVersion,
    readTipFile,
    readTipIndex,
    resetTipRotationCache,
    writeLastVersion,
    writeTipFile,
    writeTipIndex
} from '../tips';

let tmpDir: string;

let origCacheDir: string | undefined;

beforeEach(() => {
    tmpDir = createTipsTmpDir('tips-test-');
    origCacheDir = process.env.CCSTATUSLINE_CACHE_DIR;
    process.env.CCSTATUSLINE_CACHE_DIR = tmpDir;
    resetTipRotationCache();
});

afterEach(() => {
    if (origCacheDir === undefined) {
        delete process.env.CCSTATUSLINE_CACHE_DIR;
    } else {
        process.env.CCSTATUSLINE_CACHE_DIR = origCacheDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('path helpers', () => {
    it('getTipsDir uses tipDir from settings when set', () => {
        const settings = tipsSettings(tmpDir, { tipDir: '/custom/tips' });
        expect(getTipsDir(settings)).toBe('/custom/tips');
    });

    it('getTipsDir uses default cache path when tipDir is empty', () => {
        // With CCSTATUSLINE_CACHE_DIR set, it uses that as the base
        const settings = tipsSettings(tmpDir, { tipDir: '' });
        const dir = getTipsDir(settings);
        expect(dir).toContain('tips');
        expect(dir.startsWith(tmpDir)).toBe(true);
    });

    it('getLastVersionPath returns path in cache dir', () => {
        const p = getLastVersionPath();
        expect(p).toContain('last-version.json');
    });

    it('getTipIndexPath returns path in cache dir', () => {
        const p = getTipIndexPath();
        expect(p).toContain('tip-index.json');
    });
});

describe('last-version storage', () => {
    it('returns null when file does not exist', () => {
        expect(readLastVersion()).toBeNull();
    });

    it('writes and reads last version', () => {
        writeLastVersion('2.1.0');
        const result = readLastVersion();
        expect(result).not.toBeNull();
        expect(result!.version).toBe('2.1.0');
        expect(result!.checkedAt).toBeTruthy();
    });
});

describe('tip file storage', () => {
    it('returns null when file does not exist', () => {
        const settings = tipsSettings(tmpDir);
        expect(readTipFile('9.9.9', settings)).toBeNull();
    });

    it('writes and reads tip file', () => {
        const settings = tipsSettings(tmpDir);
        const tipFile = makeTipFile('2.1.0', '2.0.0', ['tip1', 'tip2']);
        writeTipFile(tipFile, settings);
        const result = readTipFile('2.1.0', settings);
        expect(result).not.toBeNull();
        expect(result!.version).toBe('2.1.0');
        expect(result!.tips).toEqual(['tip1', 'tip2']);
    });
});

describe('tip index storage', () => {
    it('returns default index when file does not exist', () => {
        const idx = readTipIndex();
        expect(idx.index).toBe(0);
        expect(idx.renderCount).toBe(0);
    });

    it('writes and reads tip index', () => {
        const idx = { index: 3, renderCount: 15, updatedAt: new Date().toISOString() };
        writeTipIndex(idx);
        const result = readTipIndex();
        expect(result.index).toBe(3);
        expect(result.renderCount).toBe(15);
    });
});

describe('compareSemver', () => {
    it('compares versions correctly', () => {
        expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
        expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0);
        expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
        expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0);
        expect(compareSemver('1.3.0', '1.2.9')).toBeGreaterThan(0);
        expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
    });

    it('handles pre-release suffixes', () => {
        expect(compareSemver('2.1.0-beta.1', '2.1.0')).toBe(0);
        expect(compareSemver('2.1.0-beta.1', '2.0.0')).toBeGreaterThan(0);
        expect(compareSemver('1.0.0-rc.1', '2.0.0')).toBeLessThan(0);
    });
});

describe('listValidTipFiles', () => {
    it('returns empty array when no files exist', () => {
        const settings = tipsSettings(tmpDir);
        expect(listValidTipFiles(settings)).toEqual([]);
    });

    it('returns non-expired tip files', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 7 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1'], 3), settings);
        writeTipFile(makeTipFile('2.2.0', '2.1.0', ['tip2'], 1), settings);
        const valid = listValidTipFiles(settings);
        expect(valid).toHaveLength(2);
    });

    it('excludes expired tip files', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 7 });
        writeTipFile(makeTipFile('2.0.0', '1.9.0', ['old'], 10), settings);
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['new'], 1), settings);
        const valid = listValidTipFiles(settings);
        expect(valid).toHaveLength(1);
        expect(valid[0]!.version).toBe('2.1.0');
    });
});

describe('getLatestTipFile', () => {
    it('returns null when no files exist', () => {
        const settings = tipsSettings(tmpDir);
        expect(getLatestTipFile(settings)).toBeNull();
    });

    it('returns highest semver tip file', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['a']), settings);
        writeTipFile(makeTipFile('2.3.0', '2.2.0', ['c']), settings);
        writeTipFile(makeTipFile('2.2.0', '2.1.0', ['b']), settings);
        const latest = getLatestTipFile(settings);
        expect(latest).not.toBeNull();
        expect(latest!.version).toBe('2.3.0');
    });
});

describe('getMergedTipPool', () => {
    it('returns empty array when no files exist', () => {
        const settings = tipsSettings(tmpDir);
        expect(getMergedTipPool(settings)).toEqual([]);
    });

    it('merges tips from all valid files, tagging each with its source version', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['a', 'b']), settings);
        writeTipFile(makeTipFile('2.2.0', '2.1.0', ['c', 'd']), settings);
        const pool = getMergedTipPool(settings);
        expect(pool).toEqual([
            { text: 'a', version: '2.1.0' },
            { text: 'b', version: '2.1.0' },
            { text: 'c', version: '2.2.0' },
            { text: 'd', version: '2.2.0' }
        ]);
    });
});

describe('advanceTipRotation', () => {
    it('returns null when pool is empty', () => {
        const settings = tipsSettings(tmpDir);
        expect(advanceTipRotation(settings)).toBeNull();
    });

    it('returns first tip on first call', () => {
        const settings = tipsSettings(tmpDir, { rotateEvery: 3, expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1', 'tip2', 'tip3']), settings);
        const tip = advanceTipRotation(settings);
        expect(tip).toEqual({ text: 'tip1', version: '2.1.0' });
    });

    it('advances tip after rotateEvery renders', () => {
        const settings = tipsSettings(tmpDir, { rotateEvery: 2, expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1', 'tip2', 'tip3']), settings);

        expect(advanceTipRotation(settings)).toEqual({ text: 'tip1', version: '2.1.0' }); // render 1
        expect(advanceTipRotation(settings)).toEqual({ text: 'tip1', version: '2.1.0' }); // render 2 → hits threshold
        expect(advanceTipRotation(settings)).toEqual({ text: 'tip2', version: '2.1.0' }); // render 3 → advanced
        expect(advanceTipRotation(settings)).toEqual({ text: 'tip2', version: '2.1.0' }); // render 4
        expect(advanceTipRotation(settings)).toEqual({ text: 'tip3', version: '2.1.0' }); // render 5 → advanced
    });

    it('wraps around when reaching end of pool', () => {
        const settings = tipsSettings(tmpDir, { rotateEvery: 1, expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1', 'tip2']), settings);

        expect(advanceTipRotation(settings)).toEqual({ text: 'tip1', version: '2.1.0' });
        expect(advanceTipRotation(settings)).toEqual({ text: 'tip2', version: '2.1.0' });
        expect(advanceTipRotation(settings)).toEqual({ text: 'tip1', version: '2.1.0' }); // wrap
    });

    it('persists renderCount to disk on every render', () => {
        // Regression test for the cross-process bug: ccstatusline runs as a
        // fresh Node process per statusline refresh, so rotation state must
        // round-trip through disk on every render, not only on threshold cross.
        const settings = tipsSettings(tmpDir, { rotateEvery: 3, expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1', 'tip2']), settings);

        advanceTipRotation(settings); // render 1 — write {index:0, renderCount:1}
        const after1 = readTipIndex();
        expect(after1.index).toBe(0);
        expect(after1.renderCount).toBe(1);

        advanceTipRotation(settings); // render 2 — write {index:0, renderCount:2}
        const after2 = readTipIndex();
        expect(after2.index).toBe(0);
        expect(after2.renderCount).toBe(2);

        advanceTipRotation(settings); // render 3 — threshold, write {index:1, renderCount:0}
        const after3 = readTipIndex();
        expect(after3.index).toBe(1);
        expect(after3.renderCount).toBe(0);
    });

    it('rotates correctly across simulated fresh processes', () => {
        // Reset the in-process pool cache between calls to simulate ccstatusline
        // being respawned by Claude Code for each statusline refresh. Only
        // disk-backed state should survive.
        const settings = tipsSettings(tmpDir, { rotateEvery: 2, expiryDays: 30 });
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['tip1', 'tip2', 'tip3']), settings);

        const sequence: string[] = [];
        for (let i = 0; i < 6; i++) {
            resetTipRotationCache();
            const tip = advanceTipRotation(settings);
            sequence.push(tip!.text);
        }

        // rotateEvery=2, so each tip should show twice before advancing.
        expect(sequence).toEqual([
            'tip1', 'tip1', // index 0 held for 2 renders
            'tip2', 'tip2', // index 1 held for 2 renders
            'tip3', 'tip3'  // index 2 held for 2 renders
        ]);
    });
});

describe('cleanupExpiredTipFiles', () => {
    it('deletes expired files', () => {
        const settings = tipsSettings(tmpDir, { expiryDays: 7 });
        writeTipFile(makeTipFile('2.0.0', '1.9.0', ['old'], 10), settings);
        writeTipFile(makeTipFile('2.1.0', '2.0.0', ['new'], 1), settings);

        cleanupExpiredTipFiles(settings);

        expect(readTipFile('2.0.0', settings)).toBeNull();
        expect(readTipFile('2.1.0', settings)).not.toBeNull();
    });
});

describe('fetchChangelog', () => {
    it('returns null for non-existent version', async () => {
        const result = await fetchChangelog('0.0.0-nonexistent');
        expect(result).toBeNull();
    });
});

describe('generateTips', () => {
    it('returns empty array when changelog is empty', async () => {
        const settings = tipsSettings(tmpDir);
        const tips = await generateTips('', settings);
        expect(tips).toEqual([]);
    });
});

describe('checkVersionAndGenerateTips', () => {
    it('returns early when version unchanged', async () => {
        const settings = tipsSettings(tmpDir);
        writeLastVersion('2.1.0');
        await checkVersionAndGenerateTips('2.1.0', settings);
        // Should not create a tip file
        expect(readTipFile('2.1.0', settings)).toBeNull();
    });

    it('returns early when tip file already exists', { timeout: 15000 }, async () => {
        // Use versions well above the real claude-code release window so
        // listReleasesBetween's live GitHub API response filters to zero
        // intermediate releases and the fallback uses just [currentVersion].
        const settings = tipsSettings(tmpDir);
        const tipFile = makeTipFile('99.1.0', '99.0.0', ['existing']);
        writeTipFile(tipFile, settings);
        writeLastVersion('99.0.0');
        await checkVersionAndGenerateTips('99.1.0', settings);
        // Last version should be updated
        const lv = readLastVersion();
        expect(lv!.version).toBe('99.1.0');
    });

    it('skips versions that already have tip files when chaining', { timeout: 15000 }, async () => {
        // Pre-populate tip files for an entire catchup chain. The multi-version
        // catchup loop should walk them idempotently without hitting the network
        // or spawning `claude --print`, and it should update lastVersion at the end.
        // Versions are far above real claude-code releases so the GitHub API
        // filter returns zero intermediates — fallback uses [currentVersion] only.
        const settings = tipsSettings(tmpDir, { expiryDays: 30 });
        writeTipFile(makeTipFile('99.1.1', '99.1.0', ['a']), settings);
        writeTipFile(makeTipFile('99.1.2', '99.1.1', ['b']), settings);
        writeTipFile(makeTipFile('99.1.3', '99.1.2', ['c']), settings);
        writeLastVersion('99.1.0');

        await checkVersionAndGenerateTips('99.1.3', settings);

        expect(readLastVersion()!.version).toBe('99.1.3');
        // All three files should still be present and unchanged
        expect(readTipFile('99.1.1', settings)!.tips).toEqual(['a']);
        expect(readTipFile('99.1.2', settings)!.tips).toEqual(['b']);
        expect(readTipFile('99.1.3', settings)!.tips).toEqual(['c']);
    });
});
