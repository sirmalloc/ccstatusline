import { execFileSync } from 'child_process';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync
} from 'fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

export interface PrData {
    number: number;
    url: string;
    title: string;
    state: string;
    reviewDecision: string;
}

const PR_CACHE_TTL = 30_000;
const GH_TIMEOUT = 5_000;
const DEFAULT_TITLE_MAX_WIDTH = 30;

export interface PrCacheDeps {
    execFileSync: typeof execFileSync;
    existsSync: typeof existsSync;
    mkdirSync: typeof mkdirSync;
    readFileSync: typeof readFileSync;
    statSync: typeof statSync;
    writeFileSync: typeof writeFileSync;
    getHomedir: typeof os.homedir;
    now: typeof Date.now;
}

const DEFAULT_PR_CACHE_DEPS: PrCacheDeps = {
    execFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    statSync,
    writeFileSync,
    getHomedir: os.homedir,
    now: Date.now
};

function getCacheDir(deps: PrCacheDeps): string {
    return path.join(deps.getHomedir(), '.cache', 'ccstatusline');
}

function getPrCacheDir(deps: PrCacheDeps): string {
    return path.join(getCacheDir(deps), 'pr');
}

function runGitForCache(args: string[], cwd: string, deps: PrCacheDeps): string {
    try {
        return deps.execFileSync('git', args, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore'],
            cwd,
            timeout: GH_TIMEOUT
        }).trim();
    } catch {
        return '';
    }
}

function getCacheRef(cwd: string, deps: PrCacheDeps): string {
    const branch = runGitForCache(['branch', '--show-current'], cwd, deps);
    if (branch.length > 0) {
        return `branch:${branch}`;
    }

    const head = runGitForCache(['rev-parse', '--short', 'HEAD'], cwd, deps);
    if (head.length > 0) {
        return `head:${head}`;
    }

    return 'unknown';
}

function getCachePath(cwd: string, ref: string, deps: PrCacheDeps): string {
    const hash = createHash('sha256')
        .update(cwd)
        .update('\0')
        .update(ref)
        .digest('hex')
        .slice(0, 16);
    return path.join(getPrCacheDir(deps), `pr-${hash}.json`);
}

function readCache(cachePath: string, deps: PrCacheDeps): PrData | null | 'miss' {
    try {
        if (!deps.existsSync(cachePath)) {
            return 'miss';
        }
        const age = deps.now() - deps.statSync(cachePath).mtimeMs;
        if (age > PR_CACHE_TTL) {
            return 'miss';
        }
        const content = deps.readFileSync(cachePath, 'utf-8').trim();
        if (content.length === 0) {
            return null;
        }
        const data = JSON.parse(content) as PrData;
        if (typeof data.number !== 'number' || typeof data.url !== 'string') {
            return 'miss';
        }
        return data;
    } catch {
        return 'miss';
    }
}

function writeCache(cachePath: string, data: PrData | null, deps: PrCacheDeps): void {
    try {
        const cacheDir = getPrCacheDir(deps);
        if (!deps.existsSync(cacheDir)) {
            deps.mkdirSync(cacheDir, { recursive: true });
        }
        deps.writeFileSync(cachePath, data ? JSON.stringify(data) : '', 'utf-8');
    } catch {
        // Best-effort caching
    }
}

export function fetchPrData(cwd: string, deps: PrCacheDeps = DEFAULT_PR_CACHE_DEPS): PrData | null {
    const cachePath = getCachePath(cwd, getCacheRef(cwd, deps), deps);
    const cached = readCache(cachePath, deps);
    if (cached !== 'miss') {
        return cached;
    }

    try {
        deps.execFileSync('gh', ['--version'], {
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: GH_TIMEOUT
        });
    } catch {
        writeCache(cachePath, null, deps);
        return null;
    }

    try {
        const output = deps.execFileSync(
            'gh',
            ['pr', 'view', '--json', 'url,number,title,state,reviewDecision'],
            {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
                cwd,
                timeout: GH_TIMEOUT
            }
        ).trim();

        if (output.length === 0) {
            writeCache(cachePath, null, deps);
            return null;
        }

        const parsed = JSON.parse(output) as Record<string, unknown>;
        if (typeof parsed.number !== 'number' || typeof parsed.url !== 'string') {
            writeCache(cachePath, null, deps);
            return null;
        }
        const data: PrData = {
            number: parsed.number,
            url: parsed.url,
            title: typeof parsed.title === 'string' ? parsed.title : '',
            state: typeof parsed.state === 'string' ? parsed.state : '',
            reviewDecision: typeof parsed.reviewDecision === 'string' ? parsed.reviewDecision : ''
        };

        writeCache(cachePath, data, deps);
        return data;
    } catch {
        writeCache(cachePath, null, deps);
        return null;
    }
}

export function getPrStatusLabel(state: string, reviewDecision: string): string {
    if (state === 'MERGED')
        return 'MERGED';
    if (state === 'CLOSED')
        return 'CLOSED';
    if (reviewDecision === 'APPROVED')
        return 'APPROVED';
    if (reviewDecision === 'CHANGES_REQUESTED')
        return 'CHANGES_REQ';
    if (state === 'OPEN')
        return 'OPEN';
    return state;
}

export function truncateTitle(title: string, maxWidth?: number): string {
    const limit = maxWidth ?? DEFAULT_TITLE_MAX_WIDTH;
    if (title.length <= limit)
        return title;
    return `${title.slice(0, limit - 1)}\u2026`;
}