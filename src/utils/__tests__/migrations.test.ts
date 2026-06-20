import {
    describe,
    expect,
    it
} from 'vitest';

import {
    detectVersion,
    migrateConfig,
    needsMigration
} from '../migrations';

describe('migrations', () => {
    it('detects version for unknown data and versioned objects', () => {
        expect(detectVersion(null)).toBe(1);
        expect(detectVersion('invalid')).toBe(1);
        expect(detectVersion({})).toBe(1);
        expect(detectVersion({ version: 2 })).toBe(2);
    });

    it('reports whether migration is needed', () => {
        expect(needsMigration({ version: 2 }, 3)).toBe(true);
        expect(needsMigration({ version: 3 }, 3)).toBe(false);
        expect(needsMigration({}, 3)).toBe(true);
    });

    it('returns original value for non-record migration input', () => {
        expect(migrateConfig('invalid', 3)).toBe('invalid');
        expect(migrateConfig(123, 3)).toBe(123);
    });

    it('migrates v1 to v2 by copying known fields and assigning ids', () => {
        const migrated = migrateConfig({
            lines: [[
                { type: 'model', color: 'cyan' },
                { type: 'separator' },
                { type: 'git-branch' }
            ]],
            flexMode: 'full',
            compactThreshold: 70,
            colorLevel: 3,
            defaultSeparator: '|',
            defaultPadding: ' ',
            inheritSeparatorColors: true,
            overrideBackgroundColor: 'black',
            overrideForegroundColor: 'white',
            globalBold: true,
            unknownField: 'ignored'
        }, 2) as Record<string, unknown>;

        expect(migrated.version).toBe(2);
        expect(migrated.flexMode).toBe('full');
        expect(migrated.compactThreshold).toBe(70);
        expect(migrated.colorLevel).toBe(3);
        expect(migrated.defaultSeparator).toBe('|');
        expect(migrated.defaultPadding).toBe(' ');
        expect(migrated.inheritSeparatorColors).toBe(true);
        expect(migrated.overrideBackgroundColor).toBe('black');
        expect(migrated.overrideForegroundColor).toBe('white');
        expect(migrated.globalBold).toBe(true);
        expect(migrated.unknownField).toBeUndefined();

        const lines = migrated.lines as Record<string, unknown>[][];
        const firstLine = lines[0];
        expect(Array.isArray(firstLine)).toBe(true);
        expect(firstLine?.map(item => item.type)).toEqual(['model', 'git-branch']);
        expect(typeof firstLine?.[0]?.id).toBe('string');
        expect(typeof firstLine?.[1]?.id).toBe('string');

        const updateMessage = migrated.updatemessage as { message?: string; remaining?: number };
        expect(updateMessage.message).toContain('v2.0.0');
        expect(updateMessage.remaining).toBe(12);
    });

    it('applies sequential migrations to reach target version', () => {
        const migrated = migrateConfig({
            lines: [[
                { type: 'model' }
            ]]
        }, 4) as Record<string, unknown>;

        expect(migrated.version).toBe(4);
        const updateMessage = migrated.updatemessage as { message?: string; remaining?: number };
        expect(updateMessage.message).toContain('v2.0.2');
        expect(updateMessage.remaining).toBe(12);
    });
});

describe('v3 to v4 hide flag migration', () => {
    function migrateItem(item: Record<string, unknown>): Record<string, unknown> | undefined {
        const migrated = migrateConfig({
            version: 3,
            lines: [[item]]
        }, 4) as { lines?: Record<string, unknown>[][] };

        return migrated.lines?.[0]?.[0];
    }

    it('bumps the version without touching unrelated data', () => {
        const migrated = migrateConfig({ version: 3, flexMode: 'full' }, 4) as Record<string, unknown>;

        expect(migrated.version).toBe(4);
        expect(migrated.flexMode).toBe('full');
        expect(migrated.updatemessage).toBeUndefined();
    });

    it.each([
        ['git-branch', { hideNoGit: 'true' }, 'no-git'],
        ['jj-changes', { hideNoJj: 'true' }, 'no-jj'],
        ['git-origin-owner', { hideNoRemote: 'true' }, 'no-remote'],
        ['git-upstream-owner', { hideNoRemote: 'true' }, 'no-upstream'],
        ['compaction-counter', { hideZero: 'true' }, 'zero'],
        ['skills', { hideWhenEmpty: 'true' }, 'empty'],
        ['extra-usage-remaining', { hideIfDisabled: 'true' }, 'disabled'],
        ['extra-usage-utilization', { hideIfDisabled: 'true' }, 'disabled'],
        ['git-is-fork', { hideWhenNotFork: 'true' }, 'not-fork']
    ])('converts %s legacy flags to the unified hide list', (type, metadata, expected) => {
        const item = migrateItem({ id: '1', type, metadata });

        expect(item?.metadata).toEqual({ hide: expected });
    });

    it('expands hideNoGit to every state it covered on git-ahead-behind', () => {
        const item = migrateItem({ id: '1', type: 'git-ahead-behind', metadata: { hideNoGit: 'true' } });

        expect(item?.metadata).toEqual({ hide: 'no-git,no-upstream,zero' });
    });

    it('expands hideNoGit to the no-data state on git-review and its legacy git-pr alias', () => {
        for (const type of ['git-review', 'git-pr']) {
            const item = migrateItem({ id: '1', type, metadata: { hideNoGit: 'true', hideStatus: 'true' } });

            expect(item?.metadata).toEqual({ hide: 'no-git,no-data,status' });
        }
    });

    it('drops disabled legacy flags without writing a hide list', () => {
        const item = migrateItem({ id: '1', type: 'git-branch', metadata: { hideNoGit: 'false' } });

        expect(item?.metadata).toBeUndefined();
    });

    it('keeps default-enabled states implicit when dropping disabled flags', () => {
        const item = migrateItem({ id: '1', type: 'git-ahead-behind', metadata: { hideNoGit: 'false' } });

        expect(item?.metadata).toBeUndefined();
    });

    it('preserves unrelated metadata', () => {
        const item = migrateItem({ id: '1', type: 'skills', metadata: { hideWhenEmpty: 'true', mode: 'list' } });

        expect(item?.metadata).toEqual({ hide: 'empty', mode: 'list' });
    });

    it('leaves unknown widget types and flag-free items untouched', () => {
        const unknown = migrateItem({ id: '1', type: 'model', metadata: { hideNoGit: 'true' } });
        expect(unknown?.metadata).toEqual({ hideNoGit: 'true' });

        const untouched = migrateItem({ id: '1', type: 'git-branch', metadata: { hide: 'no-git' } });
        expect(untouched?.metadata).toEqual({ hide: 'no-git' });
    });
});
