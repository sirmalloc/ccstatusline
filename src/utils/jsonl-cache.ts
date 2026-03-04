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
    startTime: string;
    configDir?: string;
}

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

    // Cache miss or expired - run full calculation
    const metrics = getBlockMetrics();

    // Write to cache if we found a valid block
    if (metrics) {
        writeBlockCache(metrics.startTime, activeConfigDir);
    }

    return metrics;
}