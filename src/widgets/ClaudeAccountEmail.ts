import { execSync } from 'child_process';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

export class ClaudeAccountEmailWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Displays your email from git config or environment'; }
    getDisplayName(): string { return 'Claude Account Email'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return 'you@example.com';
        }

        try {
            // Try git config first (most reliable for developers)
            try {
                const gitEmail = execSync('git config user.email', {
                    encoding: 'utf-8',
                    stdio: ['pipe', 'pipe', 'ignore']
                }).trim();

                if (gitEmail) {
                    return gitEmail;
                }
            } catch {
                // git config failed, try environment variables
            }

            // Try environment variables
            const email = process.env.GIT_AUTHOR_EMAIL
                ?? process.env.GIT_COMMITTER_EMAIL
                ?? process.env.EMAIL
                ?? process.env.USER_EMAIL;

            if (email) {
                return email.trim();
            }
        } catch {
            // All fallbacks failed
        }

        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}