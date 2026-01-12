import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class GitIndicatorsWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Shows git status indicators: + for staged, * for unstaged changes'; }
    getDisplayName(): string { return 'Git Indicators'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hideNoGit = item.metadata?.hideNoGit === 'true';
        const modifiers: string[] = [];

        if (hideNoGit) {
            modifiers.push('hide when no git');
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
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const hideNoGit = item.metadata?.hideNoGit === 'true';

        if (context.isPreview) {
            return '+*';
        }

        const indicators = this.getGitIndicators();

        // Not in a git repo
        if (indicators === null) {
            return hideNoGit ? null : '';
        }

        return indicators;
    }

    private getGitIndicators(): string | null {
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
            output += '+';
        }

        // Check for unstaged changes
        try {
            execSync('git diff --quiet', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            });
        } catch {
            // Non-zero exit = there are unstaged changes
            output += '*';
        }

        return output;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide when no git', action: 'toggle-nogit' }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
