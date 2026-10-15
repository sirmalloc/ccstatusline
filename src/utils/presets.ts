import {
    CURRENT_VERSION,
    SettingsSchema,
    type Settings
} from '../types/Settings';
import type { WidgetItem } from '../types/Widget';

// Curated starting configurations (fork issue #43): each preset is an
// ordinary settings.json payload — buildPresetSettings runs it through
// SettingsSchema so it carries every default like a hand-written config.

export interface Preset {
    name: 'starter' | 'intermediate' | 'advanced';
    title: string;
    description: string;
    lines: WidgetItem[][];
}

export type PresetName = Preset['name'];

export const PRESETS: Preset[] = [
    {
        name: 'starter',
        title: 'Starter',
        description: 'The essentials: model, context usage, git branch.',
        lines: [
            [
                { id: 'starter-model', type: 'model', color: 'cyan' },
                { id: 'starter-sep-1', type: 'separator' },
                { id: 'starter-context', type: 'context-percentage', color: 'brightBlack' },
                { id: 'starter-sep-2', type: 'separator' },
                { id: 'starter-branch', type: 'git-branch', color: 'magenta' }
            ]
        ]
    },
    {
        name: 'intermediate',
        title: 'Intermediate',
        description: 'Adds token flow, session clock and cost, and git changes.',
        lines: [
            [
                { id: 'int-model', type: 'model', color: 'cyan' },
                { id: 'int-sep-1', type: 'separator' },
                { id: 'int-context', type: 'context-percentage', color: 'brightBlack' },
                { id: 'int-sep-2', type: 'separator' },
                { id: 'int-branch', type: 'git-branch', color: 'magenta' },
                { id: 'int-sep-3', type: 'separator' },
                { id: 'int-changes', type: 'git-changes', color: 'yellow' }
            ],
            [
                { id: 'int-tokens-in', type: 'tokens-input', color: 'green' },
                { id: 'int-sep-4', type: 'separator' },
                { id: 'int-tokens-out', type: 'tokens-output', color: 'blue' },
                { id: 'int-sep-5', type: 'separator' },
                { id: 'int-tokens-total', type: 'tokens-total', color: 'brightCyan' },
                { id: 'int-sep-6', type: 'separator' },
                { id: 'int-clock', type: 'session-clock', color: 'white' },
                { id: 'int-sep-7', type: 'separator' },
                { id: 'int-cost', type: 'session-cost', color: 'green' }
            ]
        ]
    },
    {
        name: 'advanced',
        title: 'Advanced',
        description: 'The full dashboard: git details, cache, timers, usage limits.',
        lines: [
            [
                { id: 'adv-model', type: 'model', color: 'cyan' },
                { id: 'adv-sep-1', type: 'separator' },
                { id: 'adv-context', type: 'context-percentage', color: 'brightBlack' },
                { id: 'adv-sep-2', type: 'separator' },
                { id: 'adv-branch', type: 'git-branch', color: 'magenta' },
                { id: 'adv-sep-3', type: 'separator' },
                { id: 'adv-changes', type: 'git-changes', color: 'yellow' },
                { id: 'adv-sep-4', type: 'separator' },
                { id: 'adv-ahead-behind', type: 'git-ahead-behind', color: 'red' },
                { id: 'adv-sep-5', type: 'separator' },
                { id: 'adv-worktree', type: 'git-worktree', color: 'brightBlack' }
            ],
            [
                { id: 'adv-tokens-in', type: 'tokens-input', color: 'green' },
                { id: 'adv-sep-6', type: 'separator' },
                { id: 'adv-tokens-out', type: 'tokens-output', color: 'blue' },
                { id: 'adv-sep-7', type: 'separator' },
                { id: 'adv-cache-read', type: 'cache-read', color: 'brightBlack' },
                { id: 'adv-sep-8', type: 'separator' },
                { id: 'adv-cache-write', type: 'cache-write', color: 'brightBlack' },
                { id: 'adv-sep-9', type: 'separator' },
                { id: 'adv-clock', type: 'session-clock', color: 'white' },
                { id: 'adv-sep-10', type: 'separator' },
                { id: 'adv-cost', type: 'session-cost', color: 'green' },
                { id: 'adv-sep-11', type: 'separator' },
                { id: 'adv-block-timer', type: 'block-timer', color: 'red' }
            ],
            [
                { id: 'adv-session-usage', type: 'session-usage', color: 'yellow' },
                { id: 'adv-sep-12', type: 'separator' },
                { id: 'adv-reset-timer', type: 'reset-timer', color: 'red' },
                { id: 'adv-sep-13', type: 'separator' },
                { id: 'adv-weekly-usage', type: 'weekly-usage', color: 'yellow' },
                { id: 'adv-sep-14', type: 'separator' },
                { id: 'adv-weekly-reset-timer', type: 'weekly-reset-timer', color: 'red' }
            ]
        ]
    }
];

export function getPreset(name: string): Preset | null {
    return PRESETS.find(preset => preset.name === name) ?? null;
}

export function buildPresetSettings(preset: Preset): Settings {
    return SettingsSchema.parse({ version: CURRENT_VERSION, lines: preset.lines });
}
