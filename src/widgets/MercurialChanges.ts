import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class MercurialChangesWidget implements Widget {
    getDefaultColor(): string { return 'yellow'; }
    getDescription(): string { return 'Shows Mercurial changes count (+insertions, -deletions)'; }
    getDisplayName(): string { return 'Mercurial Changes'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        const hideNoHg = item.metadata?.hideNoHg === 'true';
        const modifiers: string[] = [];

        if (hideNoHg) {
            modifiers.push('hide \'no hg\'');
        }

        return {
            displayText: this.getDisplayName(),
            modifierText: modifiers.length > 0 ? `(${modifiers.join(', ')})` : undefined
        };
    }

    handleEditorAction(action: string, item: WidgetItem): WidgetItem | null {
        if (action === 'toggle-nohg') {
            const currentState = item.metadata?.hideNoHg === 'true';
            return {
                ...item,
                metadata: {
                    ...item.metadata,
                    hideNoHg: (!currentState).toString()
                }
            };
        }
        return null;
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        const hideNoHg = item.metadata?.hideNoHg === 'true';

        if (context.isPreview) {
            return '(+42,-10)';
        }

        const changes = this.getMercurialChanges();
        if (changes)
            return `(+${changes.insertions},-${changes.deletions})`;
        else
            return hideNoHg ? null : '(no hg)';
    }

    private getMercurialChanges(): { insertions: number; deletions: number } | null {
        // hg diff --stat outputs a summary line like:
        // "1 files changed, 16 insertions(+), 8 deletions(-)"
        try {
            const diffStat = execSync('hg diff --stat 2>/dev/null | tail -1', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                shell: '/bin/sh'
            }).trim();

            if (diffStat && diffStat.includes('changed')) {
                return this.parseDiffStat(diffStat);
            }
        } catch {
            // Not in a Mercurial repo or hg not available
        }

        return null;
    }

    private parseDiffStat(stat: string): { insertions: number; deletions: number } {
        let insertions = 0;
        let deletions = 0;

        // Match patterns like "16 insertions(+)" or "8 deletions(-)"
        const insertMatch = /(\d+) insertion/.exec(stat);
        const deleteMatch = /(\d+) deletion/.exec(stat);

        if (insertMatch?.[1]) {
            insertions = parseInt(insertMatch[1], 10);
        }
        if (deleteMatch?.[1]) {
            deletions = parseInt(deleteMatch[1], 10);
        }

        return { insertions, deletions };
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no hg\' message', action: 'toggle-nohg' }
        ];
    }

    supportsRawValue(): boolean { return false; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
