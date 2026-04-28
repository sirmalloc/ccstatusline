import * as fs from 'fs';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';
import { getClaudeJsonPath } from '../utils/claude-settings';

interface ClaudeJson { oauthAccount?: { emailAddress?: string } }

export class ClaudeAccountEmailWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Displays the email of the currently logged-in Claude account'; }
    getDisplayName(): string { return 'Claude Account Email'; }
    getCategory(): string { return 'Session'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'you@example.com' : 'Account: you@example.com';
        }

        try {
            const content = fs.readFileSync(getClaudeJsonPath(), 'utf-8');
            const data = JSON.parse(content) as ClaudeJson;
            const email = data.oauthAccount?.emailAddress;

            if (typeof email !== 'string' || email.length === 0) {
                return null;
            }

            return item.rawValue ? email : `Account: ${email}`;
        } catch {
            return null;
        }
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
