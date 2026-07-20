import * as fs from 'fs';
import * as path from 'path';

import { getClaudeConfigDir } from './claude-settings';

const CAVEMAN_MODES = new Set([
    'off', 'lite', 'full', 'ultra',
    'wenyan-lite', 'wenyan', 'wenyan-full', 'wenyan-ultra',
    'commit', 'review', 'compress'
]);
const MAX_READ_BYTES = 64;

export interface CavemanStatus {
    mode: string;           // whitelisted mode word, lowercase
    savings: string | null; // pre-rendered savings string, control bytes stripped
}

/**
 * Reads up to MAX_READ_BYTES from filePath, refusing symlinks (a local attacker
 * could otherwise point the flag at a sensitive file and have its bytes,
 * including ANSI escape sequences, rendered to the terminal every keystroke).
 * O_NOFOLLOW makes the open itself fail on a symlink (ELOOP), closing the
 * TOCTOU gap a separate lstat-then-open would leave. Any error, including a
 * missing file, returns null.
 */
function readCappedFile(filePath: string): string | null {
    let fd: number | undefined;
    try {
        const buffer = Buffer.alloc(MAX_READ_BYTES);
        fd = fs.openSync(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const bytesRead = fs.readSync(fd, buffer, 0, MAX_READ_BYTES, 0);
        return buffer.toString('utf-8', 0, bytesRead);
    } catch {
        return null;
    } finally {
        if (fd !== undefined) {
            fs.closeSync(fd);
        }
    }
}

/**
 * Strips control bytes (below 0x20, plus DEL) by filtering on code point
 * rather than a control-char regex — blocks terminal-escape injection and
 * OSC hyperlink spoofing via file contents.
 */
function stripControlBytes(s: string): string {
    return Array.from(s).filter((c) => {
        const code = c.codePointAt(0) ?? 0;
        return code >= 0x20 && code !== 0x7f;
    }).join('');
}

function readSavings(configDir: string): string | null {
    const raw = readCappedFile(path.join(configDir, '.caveman-statusline-suffix'));
    if (raw === null) {
        return null;
    }

    const stripped = stripControlBytes(raw);
    return stripped.length > 0 ? stripped : null;
}

export function getCavemanStatus(): CavemanStatus | null {
    const configDir = getClaudeConfigDir();

    const raw = readCappedFile(path.join(configDir, '.caveman-active'));
    if (raw === null) {
        return null;
    }

    const mode = raw
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '');

    if (!CAVEMAN_MODES.has(mode)) {
        return null;
    }

    return {
        mode,
        savings: readSavings(configDir)
    };
}
