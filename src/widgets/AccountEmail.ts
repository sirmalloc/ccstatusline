import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type {
    Widget,
    WidgetEditorDisplay,
    WidgetItem
} from '../types/Widget';

/**
 * Read the most recent profile cache file synchronously.
 * This ensures the email is available even if the async prefetch
 * hasn't completed (e.g., Claude Code's status line timeout).
 */
function readCachedEmail(): string | null {
    try {
        const cacheDir = path.join(os.homedir(), '.cache', 'ccstatusline');
        const files = fs.readdirSync(cacheDir).filter(f => f.startsWith('profile-') && f.endsWith('.json'));
        if (files.length === 0) return null;

        // Sort by modification time (newest first) so we deterministically
        // pick the most recently updated account's email.
        const sorted = files
            .map(f => ({ name: f, mtime: fs.statSync(path.join(cacheDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);

        for (const { name } of sorted) {
            const raw = fs.readFileSync(path.join(cacheDir, name), 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed?.email) {
                return parsed.email;
            }
        }
    } catch {
        // No cache available
    }
    return null;
}

export class AccountEmailWidget implements Widget {
    getDefaultColor(): string { return 'white'; }
    getDescription(): string { return 'Shows the account email address from your Claude OAuth profile'; }
    getDisplayName(): string { return 'Account Email'; }
    getCategory(): string { return 'Account'; }
    getEditorDisplay(item: WidgetItem): WidgetEditorDisplay {
        return { displayText: this.getDisplayName() };
    }

    render(item: WidgetItem, context: RenderContext, settings: Settings): string | null {
        if (context.isPreview) {
            return item.rawValue ? 'user@example.com' : 'Account: user@example.com';
        }

        const email = context.profileData?.email ?? readCachedEmail();
        if (!email) {
            return null;
        }

        return item.rawValue ? email : `Account: ${email}`;
    }

    supportsRawValue(): boolean { return true; }
    supportsColors(item: WidgetItem): boolean { return true; }
}
