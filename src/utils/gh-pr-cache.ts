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
const CACHE_DIR = path.join(os.homedir(), '.cache', 'ccstatusline');
const DEFAULT_TITLE_MAX_WIDTH = 30;

function getCachePath(cwd: string): string {
    const hash = createHash('sha256').update(cwd).digest('hex').slice(0, 16);
    return path.join(CACHE_DIR, `pr-${hash}.json`);
}

function readCache(cachePath: string): PrData | null | 'miss' {
    try {
        if (!existsSync(cachePath)) {
            return 'miss';
        }
        const age = Date.now() - statSync(cachePath).mtimeMs;
        if (age > PR_CACHE_TTL) {
            return 'miss';
        }
        const content = readFileSync(cachePath, 'utf-8').trim();
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

function writeCache(cachePath: string, data: PrData | null): void {
    try {
        if (!existsSync(CACHE_DIR)) {
            mkdirSync(CACHE_DIR, { recursive: true });
        }
        writeFileSync(cachePath, data ? JSON.stringify(data) : '', 'utf-8');
    } catch {
        // Best-effort caching
    }
}

export function fetchPrData(cwd: string): PrData | null {
    const cachePath = getCachePath(cwd);
    const cached = readCache(cachePath);
    if (cached !== 'miss') {
        return cached;
    }

    try {
        execFileSync('gh', ['--version'], {
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: GH_TIMEOUT
        });
    } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            writeCache(cachePath, null);
        }
        return null;
    }

    try {
        const output = execFileSync(
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
            writeCache(cachePath, null);
            return null;
        }

        const parsed = JSON.parse(output) as Record<string, unknown>;
        if (typeof parsed.number !== 'number' || typeof parsed.url !== 'string') {
            return null;
        }
        const data: PrData = {
            number: parsed.number,
            url: parsed.url,
            title: typeof parsed.title === 'string' ? parsed.title : '',
            state: typeof parsed.state === 'string' ? parsed.state : '',
            reviewDecision: typeof parsed.reviewDecision === 'string' ? parsed.reviewDecision : ''
        };

        writeCache(cachePath, data);
        return data;
    } catch {
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