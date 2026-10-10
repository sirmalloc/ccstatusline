import { execFileSync } from 'node:child_process';

import { resolveExecutable } from './executable-path';

/**
 * Switches the Windows console to UTF-8 so the status line's symbols print. chcp
 * comes from PATH: the status line runs in the session's directory, which
 * Windows would search first for a bare name.
 */
export function ensureWindowsUtf8CodePage(platform: NodeJS.Platform = process.platform): void {
    if (platform !== 'win32') {
        return;
    }

    try {
        execFileSync(resolveExecutable('chcp.com'), ['65001'], { stdio: 'ignore', windowsHide: true });
    } catch {
        // Ignore failures to preserve statusline output even in restricted shells.
    }
}
