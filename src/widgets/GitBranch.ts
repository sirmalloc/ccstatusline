import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type { Widget, WidgetEditorDisplay, WidgetItem } from '../types/Widget';

export class GitBranchWidget implements Widget {
    getDefaultColor(): string {
        return 'magenta';
    }
    getDescription(): string {
        return 'Shows the current git branch name';
    }
    getDisplayName(): string {
        return 'Git Branch';
    }
    getEditorDisplay(): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'main' : '⎇ main';
        }

        const branch = this.getGitBranch();
        if (branch) return item.rawValue ? branch : `⎇ ${branch}`;

        return '⎇ no git';
    }

    private getGitBranch(): string | null {
        try {
            const branch = execSync('git branch --show-current', {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim();
            return branch || null;
        } catch {
            return null;
        }
    }

    supportsRawValue(): boolean {
        return true;
    }
    supportsColors(): boolean {
        return true;
    }
}
