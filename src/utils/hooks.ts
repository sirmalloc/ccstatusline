import type { Settings } from '../types/Settings';
import type { Widget } from '../types/Widget';

import {
    getExistingStatusLine,
    loadClaudeSettings,
    saveClaudeSettings
} from './claude-settings';
import { getWidget } from './widgets';

export interface WidgetHookDef {
    event: string;
    matcher?: string;
}

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

export async function syncWidgetHooks(settings: Settings): Promise<void> {
    const needed = getActiveHookDefs(settings);
    const claudeSettings = await loadClaudeSettings({ logErrors: false });
    const hooks = (claudeSettings.hooks ?? {}) as Record<string, HookEntry[]>;

    // Remove tagged entries and legacy untagged ccstatusline hook commands
    stripManagedHooks(hooks);

    const statusCommand = await getExistingStatusLine();
    if (!statusCommand) {
        claudeSettings.hooks = Object.keys(hooks).length > 0 ? hooks : undefined;
        await saveClaudeSettings(claudeSettings);
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
    await saveClaudeSettings(claudeSettings);
}

export async function removeManagedHooks(): Promise<void> {
    const claudeSettings = await loadClaudeSettings({ logErrors: false });
    const hooks = (claudeSettings.hooks ?? {}) as Record<string, HookEntry[]>;

    stripManagedHooks(hooks);

    claudeSettings.hooks = Object.keys(hooks).length > 0 ? hooks : undefined;
    await saveClaudeSettings(claudeSettings);
}
