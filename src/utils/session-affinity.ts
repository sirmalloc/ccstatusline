import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { getOAuthToken, oauthTokenHash } from './credentials';

const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const SESSION_FILE = path.join(CACHE_DIR, 'session-tokens.json');
const SESSION_MAX_AGE = 7 * 86400; // prune entries older than 7 days

interface SessionEntry {
    hash: string;
    ts: number;
}

export interface SessionAccount {
    /** Token hash to use for cache file lookups */
    hash: string;
    /** The actual OAuth token (null if account switched and old token is gone) */
    token: string | null;
    /** Whether we can make API calls (false when session is pinned to a different account) */
    canFetch: boolean;
}

function readSessionMap(): Record<string, SessionEntry> {
    try {
        return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function writeSessionMap(map: Record<string, SessionEntry>): void {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        fs.writeFileSync(SESSION_FILE, JSON.stringify(map));
    } catch {
        // ignore write errors
    }
}

/**
 * Resolve which account (token hash) a session should use.
 *
 * On first call for a session, pins the current token's hash to that session.
 * On subsequent calls, if the keychain token has changed:
 *   - If another session already claims the new hash → keep original pin (cross-session login)
 *   - If no other session claims it → adopt the new hash (this session did /login)
 */
export function resolveSessionAccount(sessionId: string | undefined): SessionAccount {
    const token = getOAuthToken();

    if (!token) {
        return { hash: '', token: null, canFetch: false };
    }

    const currentHash = oauthTokenHash(token);

    if (!sessionId) {
        return { hash: currentHash, token, canFetch: true };
    }

    const now = Math.floor(Date.now() / 1000);
    const map = readSessionMap();

    // Prune old entries
    for (const [id, entry] of Object.entries(map)) {
        if (now - entry.ts > SESSION_MAX_AGE) {
            delete map[id];
        }
    }

    const existing = map[sessionId];

    if (!existing) {
        // First invocation for this session — pin current account
        map[sessionId] = { hash: currentHash, ts: now };
        writeSessionMap(map);
        return { hash: currentHash, token, canFetch: true };
    }

    // Update timestamp to keep entry alive
    existing.ts = now;

    if (existing.hash === currentHash) {
        // Same account — normal operation
        writeSessionMap(map);
        return { hash: currentHash, token, canFetch: true };
    }

    // Token changed — determine if this session or another one logged in.
    // If another session already claims the new hash, the login happened there.
    const claimedByOther = Object.entries(map).some(
        ([id, entry]) => id !== sessionId && entry.hash === currentHash
    );

    if (claimedByOther) {
        // Another session owns this token — keep our original pin, serve from cache
        writeSessionMap(map);
        return { hash: existing.hash, token: null, canFetch: false };
    }

    // No other session claims this token — this session just logged in
    existing.hash = currentHash;
    writeSessionMap(map);
    return { hash: currentHash, token, canFetch: true };
}
