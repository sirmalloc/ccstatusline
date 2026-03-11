import { createHash } from 'crypto';
import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

import { getClaudeConfigDir } from './claude-settings';

const TOKEN_CACHE_MAX_AGE = 30; // seconds — short so /login changes are picked up quickly

const CredentialsSchema = z.object({
    claudeAiOauth: z.object({
        accessToken: z.string().nullable().optional(),
        expiresAt: z.number().nullable().optional()
    }).optional()
});

/**
 * Compute a short hash of an OAuth token, used as a cache-file suffix
 * so that each account's data is stored separately.
 */
export function oauthTokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex').slice(0, 8);
}

// Module-level token cache shared across all consumers
let cachedToken: string | null = null;
let tokenCacheTime = 0;

function parseAccessToken(rawJson: string): string | null {
    try {
        const parsed = CredentialsSchema.safeParse(JSON.parse(rawJson));
        return parsed.success ? (parsed.data?.claudeAiOauth?.accessToken ?? null) : null;
    } catch {
        return null;
    }
}

function parseExpiresAt(rawJson: string): number {
    try {
        const parsed = CredentialsSchema.safeParse(JSON.parse(rawJson));
        return parsed.success ? (parsed.data?.claudeAiOauth?.expiresAt ?? 0) : 0;
    } catch {
        return 0;
    }
}

/**
 * Find the freshest Claude Code credential entry in the macOS keychain.
 * Claude Code v2.x uses installation-suffixed keychain entries
 * (e.g. "Claude Code-credentials-fe5233b0") that differ per install.
 * We scan all matching entries and pick the one with the latest expiresAt.
 */
function getMacOSToken(): string | null {
    try {
        const dumpOutput = execSync(
            'security dump-keychain 2>/dev/null',
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 }
        );

        const entryNames: string[] = [];
        for (const line of dumpOutput.split('\n')) {
            const match = line.match(/"svce"<blob>="(Claude Code-credentials[^"]*)"/);
            if (match?.[1]) {
                entryNames.push(match[1]);
            }
        }

        if (entryNames.length === 0) {
            return null;
        }

        let bestToken: string | null = null;
        let bestExpires = 0;

        for (const entry of entryNames) {
            try {
                const creds = execFileSync(
                    'security',
                    ['find-generic-password', '-s', entry, '-w'],
                    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
                ).trim();

                const expires = parseExpiresAt(creds);
                if (expires > bestExpires) {
                    bestExpires = expires;
                    bestToken = parseAccessToken(creds);
                }
            } catch {
                continue;
            }
        }

        return bestToken;
    } catch {
        return null;
    }
}

/**
 * Get a valid OAuth access token for the Anthropic API.
 * On macOS, scans all keychain entries and picks the freshest.
 * On other platforms, reads from the credentials file.
 * Results are cached in memory for 1 hour.
 */
export function getOAuthToken(): string | null {
    const now = Math.floor(Date.now() / 1000);

    if (cachedToken && (now - tokenCacheTime) < TOKEN_CACHE_MAX_AGE) {
        return cachedToken;
    }

    try {
        const isMac = process.platform === 'darwin';
        let token: string | null = null;

        if (isMac) {
            token = getMacOSToken();
        } else {
            const credFile = path.join(getClaudeConfigDir(), '.credentials.json');
            token = parseAccessToken(fs.readFileSync(credFile, 'utf8'));
        }

        if (token) {
            cachedToken = token;
            tokenCacheTime = now;
        }
        return token;
    } catch {
        return null;
    }
}
