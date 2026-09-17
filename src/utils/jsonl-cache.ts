import * as fs from 'fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import type { BlockMetrics } from '../types';

import { getClaudeConfigDir } from './claude-settings';
import { getBlockMetrics } from './jsonl-blocks';

const readFileSync = fs.readFileSync;
const writeFileSync = fs.writeFileSync;
const mkdirSync = fs.mkdirSync;
const existsSync = fs.existsSync;

interface BlockCache {
    startTime?: string;
    /** When set and still in the future, a scan already ran and found no block. */
    emptyUntil?: string;
    configDir?: string;
}

/**
 * How long a "no block found" answer stands before another scan is allowed.
 *
 * @remarks
 * The scan walks every transcript under the config directory, so repeating it
 * on each repaint is the dominant cost of a render whenever no block is
 * active. The widgets built on this render whole minutes, so a minute of
 * staleness costs nothing visible, and a new block can be reported at most one
 * interval late.
 */
const EMPTY_RESULT_TTL_MS = 60 * 1000;

function normalizeConfigDir(configDir: string): string {
    return path.resolve(configDir);
}

/**
 * Returns the path to the block cache file for a specific Claude config directory
 */
export function getBlockCachePath(configDir = getClaudeConfigDir()): string {
    const normalizedConfigDir = normalizeConfigDir(configDir);
    const configHash = createHash('sha256')
        .update(normalizedConfigDir)
        .digest('hex')
        .slice(0, 16);

    return path.join(
        os.homedir(),
        '.cache',
        'ccstatusline',
        `block-cache-${configHash}.json`
    );
}

/**
 * Reads the block cache file and returns the cached start time
 * Returns null if cache doesn't exist or is invalid
 */
export function readBlockCache(expectedConfigDir?: string): Date | null {
    try {
        const normalizedExpectedConfigDir = expectedConfigDir !== undefined
            ? normalizeConfigDir(expectedConfigDir)
            : undefined;
        const cachePath = getBlockCachePath(normalizedExpectedConfigDir);
        if (!existsSync(cachePath)) {
            return null;
        }
        const content = readFileSync(cachePath, 'utf-8');
        const cache = JSON.parse(content) as BlockCache;
        if (typeof cache.startTime !== 'string') {
            return null;
        }
        if (normalizedExpectedConfigDir !== undefined) {
            if (typeof cache.configDir !== 'string') {
                return null;
            }
            if (cache.configDir !== normalizedExpectedConfigDir) {
                return null;
            }
        }
        const date = new Date(cache.startTime);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return date;
    } catch {
        return null;
    }
}

/**
 * Reads the instant until which a scan is known to find no block.
 *
 * @param expectedConfigDir - Config directory the entry must name to be trusted
 * @returns That instant, or null when no usable entry is present
 */
function readEmptyBlockCache(expectedConfigDir?: string): Date | null {
    try {
        const normalizedExpectedConfigDir = expectedConfigDir !== undefined
            ? normalizeConfigDir(expectedConfigDir)
            : undefined;
        const cachePath = getBlockCachePath(normalizedExpectedConfigDir);
        if (!existsSync(cachePath)) {
            return null;
        }
        const content = readFileSync(cachePath, 'utf-8');
        const cache = JSON.parse(content) as BlockCache;
        if (typeof cache.emptyUntil !== 'string') {
            return null;
        }
        if (normalizedExpectedConfigDir !== undefined) {
            if (typeof cache.configDir !== 'string') {
                return null;
            }
            if (cache.configDir !== normalizedExpectedConfigDir) {
                return null;
            }
        }
        const date = new Date(cache.emptyUntil);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        return date;
    } catch {
        return null;
    }
}

/**
 * Records that a scan found no block, suppressing further scans until an instant.
 *
 * @param emptyUntil - Instant at which scanning may resume
 * @param configDir - Config directory the entry belongs to
 */
function writeEmptyBlockCache(emptyUntil: Date, configDir = getClaudeConfigDir()): void {
    try {
        const normalizedConfigDir = normalizeConfigDir(configDir);
        const cachePath = getBlockCachePath(normalizedConfigDir);
        const cacheDir = path.dirname(cachePath);
        if (!existsSync(cacheDir)) {
            mkdirSync(cacheDir, { recursive: true });
        }
        const cache: BlockCache = {
            emptyUntil: emptyUntil.toISOString(),
            configDir: normalizedConfigDir
        };
        writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
    } catch {
        // Silently fail - caching is best-effort
    }
}

/**
 * Writes the block start time to the cache file
 * Creates the cache directory if it doesn't exist
 */
export function writeBlockCache(startTime: Date, configDir = getClaudeConfigDir()): void {
    try {
        const normalizedConfigDir = normalizeConfigDir(configDir);
        const cachePath = getBlockCachePath(normalizedConfigDir);
        const cacheDir = path.dirname(cachePath);
        if (!existsSync(cacheDir)) {
            mkdirSync(cacheDir, { recursive: true });
        }
        const cache: BlockCache = {
            startTime: startTime.toISOString(),
            configDir: normalizedConfigDir
        };
        writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
    } catch {
        // Silently fail - caching is best-effort
    }
}

/**
 * Gets block metrics with caching support
 * Returns cached result if still valid, otherwise recalculates
 */
export function getCachedBlockMetrics(sessionDurationHours = 5): BlockMetrics | null {
    const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
    const now = new Date();
    const activeConfigDir = getClaudeConfigDir();

    // Check cache first
    const cachedStartTime = readBlockCache(activeConfigDir);
    if (cachedStartTime) {
        const blockEndTime = new Date(cachedStartTime.getTime() + sessionDurationMs);
        if (now.getTime() <= blockEndTime.getTime()) {
            // Cache is valid - return cached result
            return {
                startTime: cachedStartTime,
                lastActivity: now // We don't cache lastActivity, use current time
            };
        }
        // Cache expired - need to recalculate
    }

    // A recent scan already found nothing; repeating it walks every transcript again
    const emptyUntil = readEmptyBlockCache(activeConfigDir);
    if (emptyUntil && now.getTime() < emptyUntil.getTime()) {
        return null;
    }

    // Cache miss or expired - run full calculation
    const metrics = getBlockMetrics();

    if (metrics) {
        writeBlockCache(metrics.startTime, activeConfigDir);
    } else {
        writeEmptyBlockCache(new Date(now.getTime() + EMPTY_RESULT_TTL_MS), activeConfigDir);
    }

    return metrics;
}
