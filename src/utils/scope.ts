import * as fs from 'fs';
import * as path from 'path';

import { initConfigPath } from './config';

/**
 * Which configuration context the process operates in.
 *
 * - global: today's behavior — config in ~/.config/ccstatusline/settings.json,
 *   installs into Claude's user settings.json.
 * - project: config in <root>/.claude/ccstatusline.json (committable), installs
 *   into <root>/.claude/settings.local.json (personal, gitignored by Claude Code).
 * - custom: an explicit --config path was given; behaves exactly like global for
 *   install targets and disables TUI mode switching.
 */
export type Scope
    = | { type: 'global' }
        | { type: 'project'; root: string }
        | { type: 'custom' };

export type SwitchableScope = Exclude<Scope, { type: 'custom' }>;

let activeScope: Scope = { type: 'global' };

export function getProjectConfigPath(root: string): string {
    return path.join(root, '.claude', 'ccstatusline.json');
}

/**
 * Resolve the startup scope. Called once from main(): the TUI entry passes
 * detectProject so an existing <cwd>/.claude/ccstatusline.json selects project
 * mode; piped render and --hook paths never auto-detect.
 */
export function initScope(options: { explicitConfigPath?: string; detectProject?: boolean } = {}): void {
    if (options.explicitConfigPath) {
        activeScope = { type: 'custom' };
        return;
    }

    if (options.detectProject) {
        const root = process.cwd();
        if (fs.existsSync(getProjectConfigPath(root))) {
            setScope({ type: 'project', root });
            return;
        }
    }

    setScope({ type: 'global' });
}

export function getScope(): Scope {
    return activeScope;
}

/**
 * The single mutation point: keeps the scope and the ccstatusline config path
 * in lockstep so config.ts needs no scope awareness of its own.
 */
export function setScope(scope: SwitchableScope): void {
    activeScope = scope;
    initConfigPath(scope.type === 'project' ? getProjectConfigPath(scope.root) : undefined);
}

export function isScopeSwitchingAvailable(): boolean {
    return activeScope.type !== 'custom';
}

/**
 * Claude-settings install target override: project scope installs into the
 * project's personal settings.local.json; other scopes return null so callers
 * fall back to the user-global settings.json.
 */
export function getProjectInstallTargetPath(): string | null {
    return activeScope.type === 'project'
        ? path.join(activeScope.root, '.claude', 'settings.local.json')
        : null;
}
