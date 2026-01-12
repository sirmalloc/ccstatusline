import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getColorAnsiCode } from '../utils/colors';

export class GitIndicatorsWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Shows git status indicators: + for staged, * for unstaged changes'; }
    getDisplayName(): string { return 'Git Indicators'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hideNoGit = item.metadata?.hideNoGit === 'true';
        const preserveColors = item.preserveColors === true;
        const useCustomColors = item.metadata?.colorMode === 'custom';
        const modifiers: string[] = [];

        if (hideNoGit) {
            modifiers.push("hide 'no git'");
        }

        if (preserveColors) {
            if (useCustomColors) {
                const staged = item.metadata?.stagedColor || 'green';
                const unstaged = item.metadata?.unstagedColor || 'red';
                modifiers.push(`colors: ${staged}/${unstaged}`);
            } else {
                modifiers.push('colors: green/red');
            }
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-nogit') {
            const currentState = item.metadata?.hideNoGit === 'true';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    hideNoGit: (!currentState).toString()
                }
            };
        }
        if (action === 'toggle-preserve-colors') {
            return {
                ...item,
                preserveColors: !item.preserveColors
            };
        }
        if (action === 'toggle-color-mode') {
            const currentMode = item.metadata?.colorMode || 'raw';
            const newMode = currentMode === 'raw' ? 'custom' : 'raw';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    colorMode: newMode
                }
            };
        }
        if (action === 'cycle-staged-color') {
            const colors = ['green', 'brightGreen', 'cyan', 'brightCyan', 'yellow', 'brightYellow', 'blue', 'brightBlue', 'magenta', 'brightMagenta'];
            const current = item.metadata?.stagedColor || 'green';
            const idx = colors.indexOf(current);
            const next = colors[(idx + 1) % colors.length];
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    colorMode: 'custom',
                    stagedColor: next
                }
            };
        }
        if (action === 'cycle-unstaged-color') {
            const colors = ['red', 'brightRed', 'yellow', 'brightYellow', 'magenta', 'brightMagenta', 'cyan', 'brightCyan', 'white', 'brightWhite'];
            const current = item.metadata?.unstagedColor || 'red';
            const idx = colors.indexOf(current);
            const next = colors[(idx + 1) % colors.length];
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    colorMode: 'custom',
                    unstagedColor: next
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, _settings: Settings): string | null {
        const hideNoGit = item.metadata?.hideNoGit === 'true';
        const useColors = item.preserveColors === true;
        const useCustomColors = item.metadata?.colorMode === 'custom';
        const stagedColor = item.metadata?.stagedColor || 'green';
        const unstagedColor = item.metadata?.unstagedColor || 'red';

        if (context.isPreview) {
            if (!useColors) return '+*';
            if (useCustomColors) {
                const stagedAnsi = getColorAnsiCode(stagedColor);
                const unstagedAnsi = getColorAnsiCode(unstagedColor);
                return `${stagedAnsi}+\x1b[0m${unstagedAnsi}*\x1b[0m`;
            }
            return '\x1b[32m+\x1b[0m\x1b[31m*\x1b[0m';
        }

        const indicators = this.getGitIndicators(useColors, useCustomColors, stagedColor, unstagedColor);

        // Not in a git repo
        if (indicators === null) {
            return hideNoGit ? null : '';
        }

        return indicators;
    }

    private getGitIndicators(useColors: boolean, useCustomColors: boolean, stagedColor: string, unstagedColor: string): string | null {
        try {
            // Check if we're in a git repo
            execSync('git rev-parse --git-dir', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
        } catch {
            return null;
        }

        let output = '';

        // Check for staged changes
        try {
            execSync('git diff --staged --quiet', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
        } catch {
            // Non-zero exit = there are staged changes
            if (useColors) {
                const ansi = useCustomColors ? getColorAnsiCode(stagedColor) : '\x1b[32m';
                output += `${ansi}+\x1b[0m`;
            } else {
                output += '+';
            }
        }

        // Check for unstaged changes
        try {
            execSync('git diff --quiet', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
        } catch {
            // Non-zero exit = there are unstaged changes
            if (useColors) {
                const ansi = useCustomColors ? getColorAnsiCode(unstagedColor) : '\x1b[31m';
                output += `${ansi}*\x1b[0m`;
            } else {
                output += '*';
            }
        }

        return output;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: "(h)ide 'no git' message", action: 'toggle-nogit' },
            { key: 'p', label: '(p)reserveColors: widget sets colors', action: 'toggle-preserve-colors' },
            { key: 'm', label: 'color (m)ode: raw/custom', action: 'toggle-color-mode' },
            { key: 's', label: 'cycle (s)taged color', action: 'cycle-staged-color' },
            { key: 'u', label: 'cycle (u)nstaged color', action: 'cycle-unstaged-color' }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
