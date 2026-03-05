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

interface HookEntry {
    _tag?: string;
    matcher?: string;
    hooks?: { type: string; command: string }[];
}

function stripManagedHooks(hooks: Record<string, HookEntry[]>): void {
    for (const event of Object.keys(hooks)) {
        hooks[event] = (hooks[event] ?? []).filter(entry => entry._tag !== HOOK_TAG);
        if (hooks[event].length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete hooks[event];
        }
    }
}

function getActiveHookDefs(settings: Settings): WidgetHookDef[] {
    const seen = new Set<string>();
    const defs: WidgetHookDef[] = [];
    for (const line of settings.lines) {
        for (const item of line) {
            const widget = getWidget(item.type) as (Widget & { getHooks?: () => WidgetHookDef[] }) | null;
            if (!widget?.getHooks) {
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

    // Remove all ccstatusline-managed hooks
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