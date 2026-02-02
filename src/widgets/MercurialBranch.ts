import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    CustomKeybind,
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class MercurialBranchWidget implements Widget {
    getDefaultColor(): string { return 'magenta'; }
    getDescription(): string { return 'Shows the current Mercurial bookmark or commit description'; }
    getDisplayName(): string { return 'Mercurial Branch'; }
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
            return item.rawValue ? 'default' : '⎇ default';
        }

        const branch = this.getMercurialBranch();
        if (branch)
            return item.rawValue ? branch : `⎇ ${branch}`;

        return hideNoHg ? null : '⎇ no hg';
    }

    private getMercurialBranch(): string | null {
        // Shows bookmark if available, otherwise first line of commit description
        try {
            const result = execSync('hg log -r . -T "{if(activebookmark, activebookmark, desc|firstline)}"', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();

            if (result) {
                return result;
            }
        } catch {
            // Not in a Mercurial repo or hg not available
        }

        return null;
    }

    getCustomKeybinds(): CustomKeybind[] {
        return [
            { key: 'h', label: '(h)ide \'no hg\' message', action: 'toggle-nohg' }
        ];
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
