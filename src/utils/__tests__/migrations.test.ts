import {
    describe,
    expect,
    it
} from 'vitest';

import { DEFAULT_SETTINGS } from '../../types/Settings';
import {
    V4_HIDE_FLAG_RULES,
    detectVersion,
    migrateConfig,
    needsMigration
} from '../migrations';
import {
    getAllWidgetTypes,
    getWidget
} from '../widgets';

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

    it('converts Git Conflicts hidden-zero display to the unified zero hide state', () => {
        const item = migrateItem({
            id: '1',
            type: 'git-conflicts',
            metadata: { hideNoGit: 'true', zeroDisplay: 'hidden' }
        });

        expect(item?.metadata).toEqual({ hide: 'no-git,zero' });
    });

    it('preserves the non-hiding Git Conflicts clean display', () => {
        const item = migrateItem({
            id: '1',
            type: 'git-conflicts',
            metadata: { hideNoGit: 'true', zeroDisplay: 'clean' }
        });

        expect(item?.metadata).toEqual({ hide: 'no-git', zeroDisplay: 'clean' });
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

    // git-review's hideNoGit also hid its no-PR placeholder, so it expands to
    // both states. git-ci-status never hid its '-' placeholder, so the same flag
    // must not switch that on behind the user's back.
    it('leaves no-data off on git-ci-status when converting hideNoGit', () => {
        const item = migrateItem({ id: '1', type: 'git-ci-status', metadata: { hideNoGit: 'true' } });

        expect(item?.metadata).toEqual({ hide: 'no-git' });
    });

    it('drops disabled legacy flags without writing a hide list', () => {
        const item = migrateItem({ id: '1', type: 'git-branch', metadata: { hideNoGit: 'false' } });

        expect(item?.metadata).toBeUndefined();
    });

    it('keeps default-enabled states implicit when dropping disabled flags', () => {
        const item = migrateItem({ id: '1', type: 'git-ahead-behind', metadata: { hideNoGit: 'false' } });

        expect(item?.metadata).toBeUndefined();
    });

    // An explicit empty list is how the editor records "hide nothing", so it has
    // to outlive the conversion; folding it away re-enables default-enabled
    // states the user turned off.
    it('keeps an explicit empty hide list from re-enabling default-enabled states', () => {
        const item = migrateItem({ id: '1', type: 'git-ahead-behind', metadata: { hide: '', hideNoGit: 'false' } });

        expect(item?.metadata).toEqual({ hide: '' });
    });

    it('lets a hand-written list override a default-enabled state', () => {
        const item = migrateItem({ id: '1', type: 'git-ahead-behind', metadata: { hide: 'no-git', hideNoGit: 'false' } });

        expect(item?.metadata).toEqual({ hide: 'no-git' });
    });

    // The rule table is an object literal, so a type naming one of its inherited
    // members must not be mistaken for a rule.
    it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('leaves the %s widget type untouched', (type) => {
        const metadata = { hideNoGit: 'true' };

        expect(() => migrateItem({ id: '1', type, metadata })).not.toThrow();
        expect(migrateItem({ id: '1', type, metadata })?.metadata).toEqual(metadata);
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

    it('converts hideTitle and hideStatus independently on git-review', () => {
        expect(migrateItem({ id: '1', type: 'git-review', metadata: { hideTitle: 'true' } })?.metadata).toEqual({ hide: 'title' });
        expect(migrateItem({ id: '1', type: 'git-review', metadata: { hideStatus: 'true' } })?.metadata).toEqual({ hide: 'status' });
    });

    it.each(['cache-read', 'cache-write', 'cache-hit-rate', 'cache-timer'])('converts hideWhenEmpty on %s', (type) => {
        expect(migrateItem({ id: '1', type, metadata: { hideWhenEmpty: 'true' } })?.metadata).toEqual({ hide: 'empty' });
    });

    // The table is keyed by widget type, so a widget added without a matching
    // entry migrates to nothing and its user's setting is dropped on upgrade.
    // Drive both checks off the registry so a new widget cannot slip past.
    describe('every registered widget is covered by the hide table', () => {
        // States a v3 flag could reach. 'zero', 'no-data' and 'default-value'
        // are excluded: this PR introduces them as opt-in, so most widgets
        // declaring them have no legacy flag to convert.
        // One state can come from different flags depending on the widget:
        // Ahead/Behind reached 'no-upstream' through hideNoGit, while the
        // upstream remote widgets reached it through hideNoRemote. Any one
        // candidate converting is enough.
        const LEGACY_FLAGS_FOR_STATE: Record<string, string[]> = {
            'no-git': ['hideNoGit'],
            'no-jj': ['hideNoJj'],
            'no-remote': ['hideNoRemote'],
            'no-upstream': ['hideNoRemote', 'hideNoGit'],
            'not-fork': ['hideWhenNotFork'],
            'empty': ['hideWhenEmpty'],
            'disabled': ['hideIfDisabled']
        };

        const hideListOf = (item: Record<string, unknown> | undefined): string[] => {
            const metadata = item?.metadata as { hide?: string } | undefined;
            return (metadata?.hide ?? '').split(',').filter(state => state.length > 0);
        };

        const declaredStatesOf = (type: string): string[] => (getWidget(type)?.getHideableStates?.() ?? []).map(state => state.key);

        // Only widgets the table owns take part in the conversion. The rest
        // (whose states this PR introduces, with no v3 flag behind them) are
        // returned untouched by design, so there is nothing to convert.
        const registered = getAllWidgetTypes(DEFAULT_SETTINGS)
            .filter(type => type in V4_HIDE_FLAG_RULES)
            .map(type => ({ type, states: declaredStatesOf(type) }))
            .filter(entry => entry.states.length > 0);

        it('covers a non-trivial number of widgets', () => {
            expect(registered.length).toBeGreaterThan(20);
        });

        // The behavioural probe below can only speak for types the table lists,
        // so assert the table's shape directly too: a rule whose state order
        // disagrees with its widget silently drops the missing states, and a key
        // the registry cannot resolve is a typo that converts nothing.
        it.each(Object.keys(V4_HIDE_FLAG_RULES))('%s has a rule matching its widget', (type) => {
            const rule = V4_HIDE_FLAG_RULES[type];
            const declared = declaredStatesOf(type);

            expect(declared.length).toBeGreaterThan(0);
            expect([...(rule?.stateOrder ?? [])].sort()).toEqual([...declared].sort());
            for (const state of rule?.defaultEnabled ?? []) {
                expect(rule?.stateOrder).toContain(state);
            }
            for (const states of Object.values(rule?.legacy ?? {})) {
                for (const state of states) {
                    expect(rule?.stateOrder).toContain(state);
                }
            }
        });

        it.each(registered.map(entry => [entry.type, entry.states] as const))(
            '%s converts its legacy flags and keeps its declared states',
            (type, stateKeys) => {
                for (const stateKey of stateKeys) {
                    const candidates = LEGACY_FLAGS_FOR_STATE[stateKey] ?? [];
                    if (candidates.length === 0) {
                        continue;
                    }

                    const reached = candidates.some((legacyFlag) => {
                        const migrated = migrateItem({ id: '1', type, metadata: { [legacyFlag]: 'true' } });
                        return hideListOf(migrated).includes(stateKey);
                    });
                    expect(`${type}:${stateKey} reached by ${reached ? 'a legacy flag' : 'nothing'}`)
                        .toBe(`${type}:${stateKey} reached by a legacy flag`);
                }

                // A hand-written list is authoritative, so every state the widget
                // declares has to survive the conversion rather than being
                // filtered out by a stale state order. The disabled flag is what
                // puts the item on the conversion path at all, since an item
                // carrying no legacy key is returned untouched; 'false' keeps the
                // flag from contributing states of its own, so the assertion
                // isolates the state-order filter.
                const probe = migrateItem({
                    id: '1',
                    type,
                    metadata: { hide: stateKeys.join(','), hideNoGit: 'false' }
                });
                // The trigger flag is consumed by the conversion, so its absence
                // is proof the probe reached the filter. Without this the
                // assertion below passes vacuously for an item returned
                // untouched, which is how the original version of this test
                // missed three stale state orders.
                expect(Object.keys((probe?.metadata ?? {}) as Record<string, unknown>)).not.toContain('hideNoGit');
                expect(hideListOf(probe).sort()).toEqual([...stateKeys].sort());
            }
        );
    });
});
