import * as fs from 'fs';
import * as path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

interface CcSwitchConfig {
    activeAccountNumber: number;
    accounts: {
        [key: string]: {
            email: string;
            nickname?: string;
        };
    };
}

export class ClaudeAccountEmailWidget implements Widget {
    getDefaultColor(): string { return 'blue'; }
    getDescription(): string { return 'Displays the currently active Claude account email from ccswitch'; }
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
            const homeDir = process.env.HOME;
            if (!homeDir) {
                return null;
            }

            const configPath = path.join(homeDir, '.claude-switch-backup', 'sequence.json');

            if (!fs.existsSync(configPath)) {
                return null;
            }

            const content = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content) as CcSwitchConfig;

            const activeAccountNum = config.activeAccountNumber.toString();
            const activeAccount = config.accounts[activeAccountNum];

            if (activeAccount && activeAccount.email) {
                const email = activeAccount.email;
                if (item.rawValue) {
                    return email;
                }
                // Include nickname if available
                if (activeAccount.nickname) {
                    return `${activeAccount.nickname} (${email})`;
                }
                return email;
            }
        } catch {
            // File not readable or invalid JSON
        }

        return null;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
