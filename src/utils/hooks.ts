import * as fs from 'fs';

import type { Settings } from '../types/Settings';
import type { Widget } from '../types/Widget';

import {
    getActiveClaudeSettingsPath,
    getClaudeLocalSettingsPath,
    getClaudeSettingsPath,
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
    const activePath = getActiveClaudeSettingsPath();

    // Clean stale managed hooks from the non-active file to prevent duplicates
    const globalPath = getClaudeSettingsPath();
    const localPath = getClaudeLocalSettingsPath();
    const nonActivePath = activePath === localPath ? globalPath : localPath;
    if (fs.existsSync(nonActivePath)) {
        try {
            const otherSettings = await loadClaudeSettings({ logErrors: false, filePath: nonActivePath });
            if (Object.keys(otherSettings).length > 0) {
                const otherHooks = (otherSettings.hooks ?? {}) as Record<string, HookEntry[]>;
                if (Object.values(otherHooks).some(entries => entries.some(e => e._tag === HOOK_TAG))) {
                    stripManagedHooks(otherHooks);
                    otherSettings.hooks = Object.keys(otherHooks).length > 0 ? otherHooks : undefined;
                    await saveClaudeSettings(otherSettings, nonActivePath);
                }
            }
        } catch { /* ignore cleanup errors */ }
    }

    // Load, strip, and re-add hooks on the active file
    const claudeSettings = await loadClaudeSettings({ logErrors: false, filePath: activePath });
    const hooks = (claudeSettings.hooks ?? {}) as Record<string, HookEntry[]>;

    // Remove all ccstatusline-managed hooks
    stripManagedHooks(hooks);

    const statusCommand = await getExistingStatusLine();
    if (!statusCommand) {
        claudeSettings.hooks = Object.keys(hooks).length > 0 ? hooks : undefined;
        await saveClaudeSettings(claudeSettings, activePath);
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
    await saveClaudeSettings(claudeSettings, activePath);
}

export async function removeManagedHooks(): Promise<void> {
    // Clean managed hooks from both settings files
    for (const filePath of [getClaudeSettingsPath(), getClaudeLocalSettingsPath()]) {
        if (!fs.existsSync(filePath)) {
            continue;
        }
        try {
            const claudeSettings = await loadClaudeSettings({ logErrors: false, filePath });
            const hooks = (claudeSettings.hooks ?? {}) as Record<string, HookEntry[]>;
            if (Object.values(hooks).some(entries => entries.some(e => e._tag === HOOK_TAG))) {
                stripManagedHooks(hooks);
                claudeSettings.hooks = Object.keys(hooks).length > 0 ? hooks : undefined;
                await saveClaudeSettings(claudeSettings, filePath);
            }
        } catch { /* ignore cleanup errors */ }
    }
}
