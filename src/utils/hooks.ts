import * as fs from 'fs';

import type { Settings } from '../types/Settings';
import type { Widget } from '../types/Widget';

import {
    getExistingStatusLine,
    getInstallTargetPath,
    loadClaudeSettings,
    saveClaudeSettings
} from './claude-settings';
import { getWidget } from './widgets';

export interface WidgetHookDef {
    event: string;
    matcher?: string;
}

export interface SyncWidgetHooksOptions { targetPath?: string }

const HOOK_TAG = 'ccstatusline-managed';

// Matches ccstatusline hook commands written by any install method
// (global binary, `bunx ccstatusline@latest --hook`, `npx ccstatusline --hook`, …).
// Used to heal legacy/untagged hooks that predate HOOK_TAG so they do not
// accumulate alongside the managed set on every sync. The space before `--hook`
// and trailing boundary avoid matching unrelated `--hook*` substrings.
const CCSTATUSLINE_HOOK_PATTERN = /ccstatusline.* --hook(?:\s|$)/;

interface HookEntry {
    _tag?: string;
    matcher?: string;
    hooks?: { type: string; command: string }[];
}

type WidgetWithHooks = Widget & { getHooks(): WidgetHookDef[] };

function hasWidgetHooks(widget: Widget | null): widget is WidgetWithHooks {
    return Boolean(widget && 'getHooks' in widget && typeof widget.getHooks === 'function');
}

function isCcstatuslineManagedEntry(entry: HookEntry): boolean {
    return entry._tag === HOOK_TAG;
}

function isLegacyCcstatuslineHookCommand(hook: { type: string; command: string }): boolean {
    return CCSTATUSLINE_HOOK_PATTERN.test(hook.command);
}

function stripManagedHookEntry(entry: HookEntry): HookEntry | null {
    if (isCcstatuslineManagedEntry(entry)) {
        return null;
    }

    if (!entry.hooks) {
        return entry;
    }

    const remainingHooks = entry.hooks.filter(hook => !isLegacyCcstatuslineHookCommand(hook));
    if (remainingHooks.length === entry.hooks.length) {
        return entry;
    }

    if (remainingHooks.length === 0) {
        return null;
    }

    return {
        ...entry,
        hooks: remainingHooks
    };
}

function stripManagedHooks(hooks: Record<string, HookEntry[]>): void {
    for (const event of Object.keys(hooks)) {
        hooks[event] = (hooks[event] ?? [])
            .map(stripManagedHookEntry)
            .filter((entry): entry is HookEntry => entry !== null);
        if (hooks[event].length === 0) {
            Reflect.deleteProperty(hooks, event);
        }
    }
}

function getActiveHookDefs(settings: Settings): WidgetHookDef[] {
    const seen = new Set<string>();
    const defs: WidgetHookDef[] = [];
    for (const line of settings.lines) {
        for (const item of line) {
            const widget = getWidget(item.type);
            if (!hasWidgetHooks(widget)) {
                continue;
            }
            for (const hook of widget.getHooks()) {
                const key = `${hook.event}:${hook.matcher ?? ''}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    defs.push(hook);
                }
            }
        }
    }
    return defs;
}

export async function syncWidgetHooks(settings: Settings, options: SyncWidgetHooksOptions = {}): Promise<void> {
    // Resolve once: used for the no-op short-circuit below and every read/write in
    // this call, so the check and the actual I/O always agree on the same file.
    const targetPath = options.targetPath ?? getInstallTargetPath();
    const needed = getActiveHookDefs(settings);
    const claudeSettings = await loadClaudeSettings({ logErrors: false, targetPath });
    const hooks = (claudeSettings.hooks ?? {}) as Record<string, HookEntry[]>;

    // Remove tagged entries and legacy untagged ccstatusline hook commands
    stripManagedHooks(hooks);

    // Nothing to add, nothing on disk to clean up, and no file to touch: skip
    // materializing an empty Claude settings file (e.g. settings.local.json) just
    // to persist `{}`.
    if (
        !fs.existsSync(targetPath)
        && needed.length === 0
        && !claudeSettings.statusLine
        && Object.keys(hooks).length === 0
    ) {
        return;
    }

    const statusCommand = await getExistingStatusLine({ targetPath });
    if (!statusCommand) {
        claudeSettings.hooks = Object.keys(hooks).length > 0 ? hooks : undefined;
        await saveClaudeSettings(claudeSettings, targetPath);
        return;
    }
    const hookCommand = `${statusCommand} --hook`;

    // Add needed hooks
    for (const def of needed) {
        const entry: HookEntry = {
            _tag: HOOK_TAG,
            hooks: [{ type: 'command', command: hookCommand }]
        };
        if (def.matcher) {
            entry.matcher = def.matcher;
        }
        const list = hooks[def.event] ??= [];
        list.push(entry);
    }

    claudeSettings.hooks = Object.keys(hooks).length > 0 ? hooks : undefined;
    await saveClaudeSettings(claudeSettings, targetPath);
}

export async function removeManagedHooks(options: SyncWidgetHooksOptions = {}): Promise<void> {
    const claudeSettings = await loadClaudeSettings({ logErrors: false, targetPath: options.targetPath });
    const hooks = (claudeSettings.hooks ?? {}) as Record<string, HookEntry[]>;

    stripManagedHooks(hooks);

    claudeSettings.hooks = Object.keys(hooks).length > 0 ? hooks : undefined;
    await saveClaudeSettings(claudeSettings, options.targetPath);
}
