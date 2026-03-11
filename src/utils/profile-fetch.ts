import * as fs from 'fs';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as os from 'os';
import * as path from 'path';
import { z } from 'zod';

import { getOAuthToken, oauthTokenHash } from './credentials';
import type { SessionAccount } from './session-affinity';

export interface ProfileData {
    email?: string;
    fullName?: string;
    displayName?: string;
    organizationName?: string;
    error?: 'no-credentials' | 'timeout' | 'api-error' | 'parse-error';
}

// Cache configuration — profile data changes rarely
const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const CACHE_MAX_AGE = 86400; // 24 hours

function getProfileCacheFile(hash: string): string {
    return path.join(CACHE_DIR, `profile-${hash}.json`);
}

const PROFILE_API_HOST = 'api.anthropic.com';
const PROFILE_API_PATH = '/api/oauth/profile';
const PROFILE_API_TIMEOUT_MS = 5000;

const ProfileApiResponseSchema = z.object({
    account: z.object({
        email: z.string().nullable().optional(),
        full_name: z.string().nullable().optional(),
        display_name: z.string().nullable().optional()
    }).optional(),
    organization: z.object({
        name: z.string().nullable().optional()
    }).optional()
});

const CachedProfileDataSchema = z.object({
    email: z.string().nullable().optional(),
    fullName: z.string().nullable().optional(),
    displayName: z.string().nullable().optional(),
    organizationName: z.string().nullable().optional()
});

// Memory cache — invalidated when token changes (different account)
let cachedProfileData: ProfileData | null = null;
let profileCacheTime = 0;
let lastUsedTokenHash: string | null = null;

function parseJsonWithSchema<T>(rawJson: string, schema: z.ZodType<T>): T | null {
    try {
        const parsed = schema.safeParse(JSON.parse(rawJson));
        return parsed.success ? parsed.data : null;
    } catch {
        return null;
    }
}

function ensureCacheDirExists(): void {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

function getProxyUrl(): string | null {
    const proxyUrl = process.env.HTTPS_PROXY?.trim();
    return proxyUrl || null;
}

async function fetchFromProfileApi(token: string): Promise<{ kind: 'success'; body: string } | { kind: 'error' }> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value: { kind: 'success'; body: string } | { kind: 'error' }) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const proxyUrl = getProxyUrl();
        const requestOptions: https.RequestOptions = {
            hostname: PROFILE_API_HOST,
            path: PROFILE_API_PATH,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'anthropic-beta': 'oauth-2025-04-20'
            },
            timeout: PROFILE_API_TIMEOUT_MS,
            ...(proxyUrl ? { agent: new HttpsProxyAgent(proxyUrl) } : {})
        };

        const request = https.request(requestOptions, (response) => {
            let data = '';
            response.setEncoding('utf8');
            response.on('data', (chunk: string) => { data += chunk; });
            response.on('end', () => {
                if (response.statusCode === 200 && data) {
                    finish({ kind: 'success', body: data });
                } else {
                    finish({ kind: 'error' });
                }
            });
        });

        request.on('error', () => { finish({ kind: 'error' }); });
        request.on('timeout', () => { request.destroy(); finish({ kind: 'error' }); });
        request.end();
    });
}

export async function fetchProfileData(session?: SessionAccount): Promise<ProfileData> {
    const now = Math.floor(Date.now() / 1000);

    // Use session-pinned account if provided, otherwise fall back to current token
    let token: string | null;
    let hash: string;
    let canFetch: boolean;

    if (session) {
        token = session.token;
        hash = session.hash;
        canFetch = session.canFetch;
    } else {
        token = getOAuthToken();
        hash = token ? oauthTokenHash(token) : '';
        canFetch = true;
    }

    if (!hash) {
        return { error: 'no-credentials' };
    }

    const cacheFile = getProfileCacheFile(hash);

    // Invalidate memory cache if token changed (different account)
    if (lastUsedTokenHash && lastUsedTokenHash !== hash) {
        cachedProfileData = null;
        profileCacheTime = 0;
    }
    lastUsedTokenHash = hash;

    // Check memory cache
    if (cachedProfileData && !cachedProfileData.error && (now - profileCacheTime) < CACHE_MAX_AGE) {
        return cachedProfileData;
    }

    // Check per-token file cache (no age limit when we can't fetch — serve stale)
    try {
        const stat = fs.statSync(cacheFile);
        const fileAge = now - Math.floor(stat.mtimeMs / 1000);
        if (!canFetch || fileAge < CACHE_MAX_AGE) {
            const raw = fs.readFileSync(cacheFile, 'utf8');
            const parsed = parseJsonWithSchema(raw, CachedProfileDataSchema);
            if (parsed?.email) {
                const data: ProfileData = {
                    email: parsed.email ?? undefined,
                    fullName: parsed.fullName ?? undefined,
                    displayName: parsed.displayName ?? undefined,
                    organizationName: parsed.organizationName ?? undefined
                };
                cachedProfileData = data;
                profileCacheTime = now;
                return data;
            }
        }
    } catch {
        // Continue to API
    }

    // Can't make API calls — session is pinned to a different account
    if (!canFetch || !token) {
        return cachedProfileData ?? { error: 'no-credentials' };
    }

    // Fetch from API
    try {
        const response = await fetchFromProfileApi(token);
        if (response.kind === 'error') {
            return cachedProfileData ?? { error: 'api-error' };
        }

        const parsed = parseJsonWithSchema(response.body, ProfileApiResponseSchema);
        if (!parsed?.account?.email) {
            return cachedProfileData ?? { error: 'parse-error' };
        }

        const profileData: ProfileData = {
            email: parsed.account.email ?? undefined,
            fullName: parsed.account.full_name ?? undefined,
            displayName: parsed.account.display_name ?? undefined,
            organizationName: parsed.organization?.name ?? undefined
        };

        // Save to per-token cache file
        try {
            ensureCacheDirExists();
            fs.writeFileSync(cacheFile, JSON.stringify(profileData));
        } catch {
            // Ignore
        }

        cachedProfileData = profileData;
        profileCacheTime = now;
        return profileData;
    } catch {
        return cachedProfileData ?? { error: 'api-error' };
    }
}
