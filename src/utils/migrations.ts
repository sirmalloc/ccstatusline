import type { WidgetItem } from '../types/Widget';

import { generateGuid } from './guid';

// Type for migration functions
interface Migration {
    fromVersion: number;
    toVersion: number;
    description: string;
    migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

type V1MigratedField
    = | 'flexMode'
        | 'compactThreshold'
        | 'colorLevel'
        | 'defaultSeparator'
        | 'defaultPadding'
        | 'inheritSeparatorColors'
        | 'overrideBackgroundColor'
        | 'overrideForegroundColor'
        | 'globalBold';

interface V1FieldRule {
    key: V1MigratedField;
    isValid: (value: unknown) => boolean;
}

// Type guards for checking data structure
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const V1_FIELD_RULES: V1FieldRule[] = [
    {
        key: 'flexMode',
        isValid: value => typeof value === 'string'
    },
    {
        key: 'compactThreshold',
        isValid: value => typeof value === 'number'
    },
    {
        key: 'colorLevel',
        isValid: value => typeof value === 'number'
    },
    {
        key: 'defaultSeparator',
        isValid: value => typeof value === 'string'
    },
    {
        key: 'defaultPadding',
        isValid: value => typeof value === 'string'
    },
    {
        key: 'inheritSeparatorColors',
        isValid: value => typeof value === 'boolean'
    },
    {
        key: 'overrideBackgroundColor',
        isValid: value => typeof value === 'string'
    },
    {
        key: 'overrideForegroundColor',
        isValid: value => typeof value === 'string'
    },
    {
        key: 'globalBold',
        isValid: value => typeof value === 'boolean'
    }
];

function toWidgetLine(line: unknown[], stripSeparators: boolean): WidgetItem[] {
    const lineToProcess = stripSeparators
        ? line.filter((item) => {
            if (isRecord(item)) {
                return item.type !== 'separator';
            }
            return true;
        })
        : line;

    const typedLine: WidgetItem[] = [];
    for (const item of lineToProcess) {
        if (isRecord(item) && typeof item.type === 'string') {
            typedLine.push({
                ...item,
                id: generateGuid(),
                type: item.type
            });
        }
    }

    return typedLine;
}

function migrateV1Lines(data: Record<string, unknown>): WidgetItem[][] | undefined {
    if (!Array.isArray(data.lines)) {
        return undefined;
    }

    const stripSeparators = Boolean(data.defaultSeparator);
    const processedLines: WidgetItem[][] = [];

    for (const line of data.lines) {
        if (Array.isArray(line)) {
            processedLines.push(toWidgetLine(line, stripSeparators));
        }
    }

    return processedLines;
}

function copyV1Fields(data: Record<string, unknown>, target: Record<string, unknown>): void {
    for (const rule of V1_FIELD_RULES) {
        const value = data[rule.key];
        if (rule.isValid(value)) {
            target[rule.key] = value;
        }
    }
}

// v3 -> v4: per-widget boolean hide flags become the unified metadata.hide
// list. The tables are a frozen snapshot of v3 semantics keyed by widget type
// (including the pre-existing 'git-pr' alias for 'git-review', which is only
// upgraded in memory at load time and can persist on disk). hideNoGit expands
// to several states where one flag covered multiple placeholders: Git
// Ahead/Behind also hid '(no upstream)' and Git PR also hid the no-PR
// placeholder. defaultEnabled lists states a widget hides without any
// metadata (Git Ahead/Behind's previously hardcoded 0/0 auto-hide); they are
// folded into a written hide list because a present list is authoritative and
// would otherwise turn them off.
interface HideFlagRule {
    legacy: Record<string, string[]>;
    stateOrder: string[];
    defaultEnabled?: string[];
}

const NO_GIT_HIDE_RULE: HideFlagRule = { legacy: { hideNoGit: ['no-git'] }, stateOrder: ['no-git'] };
const NO_JJ_HIDE_RULE: HideFlagRule = { legacy: { hideNoJj: ['no-jj'] }, stateOrder: ['no-jj'] };
const NO_REMOTE_HIDE_RULE: HideFlagRule = { legacy: { hideNoRemote: ['no-remote'] }, stateOrder: ['no-remote'] };
const NO_UPSTREAM_HIDE_RULE: HideFlagRule = { legacy: { hideNoRemote: ['no-upstream'] }, stateOrder: ['no-upstream'] };
const GIT_REVIEW_HIDE_RULE: HideFlagRule = {
    legacy: {
        hideNoGit: ['no-git', 'no-data'],
        hideStatus: ['status'],
        hideTitle: ['title']
    },
    stateOrder: ['no-git', 'no-data', 'status', 'title']
};
const EXTRA_USAGE_HIDE_RULE: HideFlagRule = { legacy: { hideIfDisabled: ['disabled'] }, stateOrder: ['disabled'] };
const CACHE_HIDE_RULE: HideFlagRule = { legacy: { hideWhenEmpty: ['empty'] }, stateOrder: ['empty'] };

const V4_HIDE_FLAG_RULES: Record<string, HideFlagRule> = {
    'git-branch': NO_GIT_HIDE_RULE,
    'git-changes': NO_GIT_HIDE_RULE,
    'git-insertions': NO_GIT_HIDE_RULE,
    'git-deletions': NO_GIT_HIDE_RULE,
    'git-staged-files': NO_GIT_HIDE_RULE,
    'git-unstaged-files': NO_GIT_HIDE_RULE,
    'git-untracked-files': NO_GIT_HIDE_RULE,
    'git-clean-status': NO_GIT_HIDE_RULE,
    'git-root-dir': NO_GIT_HIDE_RULE,
    'git-worktree': NO_GIT_HIDE_RULE,
    'git-status': NO_GIT_HIDE_RULE,
    'git-staged': NO_GIT_HIDE_RULE,
    'git-unstaged': NO_GIT_HIDE_RULE,
    'git-untracked': NO_GIT_HIDE_RULE,
    'git-conflicts': NO_GIT_HIDE_RULE,
    'git-sha': NO_GIT_HIDE_RULE,
    'git-ahead-behind': {
        legacy: { hideNoGit: ['no-git', 'no-upstream'] },
        stateOrder: ['no-git', 'no-upstream', 'zero'],
        defaultEnabled: ['zero']
    },
    'git-review': GIT_REVIEW_HIDE_RULE,
    'git-pr': GIT_REVIEW_HIDE_RULE,
    'git-origin-owner': NO_REMOTE_HIDE_RULE,
    'git-origin-repo': NO_REMOTE_HIDE_RULE,
    'git-origin-owner-repo': NO_REMOTE_HIDE_RULE,
    'git-upstream-owner': NO_UPSTREAM_HIDE_RULE,
    'git-upstream-repo': NO_UPSTREAM_HIDE_RULE,
    'git-upstream-owner-repo': NO_UPSTREAM_HIDE_RULE,
    'git-is-fork': { legacy: { hideWhenNotFork: ['not-fork'] }, stateOrder: ['not-fork'] },
    'jj-bookmarks': NO_JJ_HIDE_RULE,
    'jj-workspace': NO_JJ_HIDE_RULE,
    'jj-root-dir': NO_JJ_HIDE_RULE,
    'jj-changes': NO_JJ_HIDE_RULE,
    'jj-insertions': NO_JJ_HIDE_RULE,
    'jj-deletions': NO_JJ_HIDE_RULE,
    'jj-description': NO_JJ_HIDE_RULE,
    'jj-revision': NO_JJ_HIDE_RULE,
    'compaction-counter': { legacy: { hideZero: ['zero'] }, stateOrder: ['zero'] },
    'skills': { legacy: { hideWhenEmpty: ['empty'] }, stateOrder: ['empty'] },
    'cache-read': CACHE_HIDE_RULE,
    'cache-write': CACHE_HIDE_RULE,
    'cache-hit-rate': CACHE_HIDE_RULE,
    'extra-usage-utilization': EXTRA_USAGE_HIDE_RULE,
    'extra-usage-remaining': EXTRA_USAGE_HIDE_RULE,
    'extra-usage-used': EXTRA_USAGE_HIDE_RULE
};

const V4_LEGACY_HIDE_KEYS = [
    'hideNoGit',
    'hideNoJj',
    'hideNoRemote',
    'hideZero',
    'hideWhenEmpty',
    'hideIfDisabled',
    'hideStatus',
    'hideTitle',
    'hideWhenNotFork'
];

function migrateItemHideFlags(item: unknown): unknown {
    if (!isRecord(item) || typeof item.type !== 'string' || !isRecord(item.metadata)) {
        return item;
    }

    const rule = V4_HIDE_FLAG_RULES[item.type];
    if (!rule) {
        return item;
    }

    const metadata = item.metadata;
    const presentKeys = V4_LEGACY_HIDE_KEYS.filter(key => key in metadata);
    if (presentKeys.length === 0) {
        return item;
    }

    const enabled = new Set<string>(rule.defaultEnabled ?? []);
    // A hand-written hide list takes part in the union so it is never lost
    if (typeof metadata.hide === 'string') {
        for (const key of metadata.hide.split(',')) {
            if (key.trim().length > 0) {
                enabled.add(key.trim());
            }
        }
    }
    for (const key of presentKeys) {
        if (metadata[key] === 'true') {
            for (const state of rule.legacy[key] ?? []) {
                enabled.add(state);
            }
        }
    }

    const nextMetadata: Record<string, unknown> = Object.fromEntries(
        Object.entries(metadata).filter(([key]) => !V4_LEGACY_HIDE_KEYS.includes(key) && key !== 'hide')
    );
    const orderedEnabled = rule.stateOrder.filter(state => enabled.has(state));
    const defaults = rule.defaultEnabled ?? [];
    const matchesDefaults = orderedEnabled.length === defaults.length
        && orderedEnabled.every(state => defaults.includes(state));
    if (!matchesDefaults) {
        nextMetadata.hide = orderedEnabled.join(',');
    }

    const migratedItem: Record<string, unknown> = { ...item };
    if (Object.keys(nextMetadata).length > 0) {
        migratedItem.metadata = nextMetadata;
    } else {
        delete migratedItem.metadata;
    }

    return migratedItem;
}

// Define all migrations here
export const migrations: Migration[] = [
    {
        fromVersion: 1,
        toVersion: 2,
        description: 'Migrate from v1 to v2',
        migrate: (data) => {
            // Build a new v2 config from v1 data, only copying known fields
            const migrated: Record<string, unknown> = {};

            // Process lines: strip separators if needed and assign GUIDs
            const processedLines = migrateV1Lines(data);
            if (processedLines) {
                migrated.lines = processedLines;
            }

            // Copy all v1 fields that exist
            copyV1Fields(data, migrated);

            // Add version field for v2
            migrated.version = 2;

            // Add update message for v2 migration
            migrated.updatemessage = {
                message: 'ccstatusline updated to v2.0.0, launch tui to use new settings',
                remaining: 12
            };

            return migrated;
        }
    },
    {
        fromVersion: 2,
        toVersion: 3,
        description: 'Migrate from v2 to v3',
        migrate: (data) => {
            // Copy all existing data to v3
            const migrated: Record<string, unknown> = { ...data };

            // Update version to 3
            migrated.version = 3;

            // Add update message for v3 migration
            migrated.updatemessage = {
                message: 'ccstatusline updated to v2.0.2, 5hr block timer widget added',
                remaining: 12
            };

            return migrated;
        }
    },
    {
        fromVersion: 3,
        toVersion: 4,
        description: 'Migrate from v3 to v4',
        migrate: (data) => {
            const migrated: Record<string, unknown> = { ...data };

            // Convert per-widget hide flags to the unified metadata.hide list.
            // No updatemessage: rendering is unchanged, so there is nothing
            // for users to act on.
            if (Array.isArray(data.lines)) {
                migrated.lines = data.lines.map((line: unknown) => (Array.isArray(line)
                    ? line.map(migrateItemHideFlags)
                    : line));
            }

            migrated.version = 4;

            return migrated;
        }
    }
];

/**
 * Detect the version of the config data
 */
export function detectVersion(data: unknown): number {
    if (!isRecord(data))
        return 1;

    // If it has a version field, use it
    if (typeof data.version === 'number')
        return data.version;

    // No version field means it's the old v1 format
    return 1;
}

/**
 * Migrate config data from its current version to the target version
 */
export function migrateConfig(data: unknown, targetVersion: number): unknown {
    if (!isRecord(data))
        return data;

    let currentVersion = detectVersion(data);
    let migrated: Record<string, unknown> = { ...data };

    // Apply migrations sequentially
    while (currentVersion < targetVersion) {
        const migration = migrations.find(m => m.fromVersion === currentVersion);

        if (!migration)
            break;

        migrated = migration.migrate(migrated);
        currentVersion = migration.toVersion;
    }

    return migrated;
}

/**
 * Check if a migration is needed
 */
export function needsMigration(data: unknown, targetVersion: number): boolean {
    return detectVersion(data) < targetVersion;
}
