import * as fs from 'node:fs';
import path from 'node:path';
import {
    glob,
    globSync
} from 'tinyglobby';

import type { BlockMetrics } from '../types';

import { getClaudeConfigDir } from './claude-settings';
import {
    iterateJsonlLines,
    iterateJsonlLinesSync,
    parseJsonlLine
} from './jsonl-lines';

const statSync = fs.statSync;

/**
 * Gets block metrics for the current 5-hour block from JSONL files
 */
export function getBlockMetrics(): BlockMetrics | null {
    const claudeDir: string | null = getClaudeConfigDir();

    if (!claudeDir)
        return null;

    try {
        return findMostRecentBlockStartTime(claudeDir);
    } catch {
        return null;
    }
}

/**
 * Async twin of getBlockMetrics for the daemon prefetch (#18): the walk over
 * every transcript under the config directory is the single most expensive
 * provider read, so the daemon runs it off the render loop.
 */
export async function getBlockMetricsAsync(env?: NodeJS.ProcessEnv): Promise<BlockMetrics | null> {
    const claudeDir: string | null = getClaudeConfigDir(env ?? process.env);

    if (!claudeDir)
        return null;

    try {
        return await findMostRecentBlockStartTimeAsync(claudeDir);
    } catch {
        return null;
    }
}

/**
 * Efficiently finds the most recent 5-hour block start time from JSONL files
 * Uses file modification times as hints to avoid unnecessary reads
 */
function findMostRecentBlockStartTime(
    rootDir: string,
    sessionDurationHours = 5
): BlockMetrics | null {
    const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
    const now = new Date();

    // Step 1: Find all JSONL files with their modification times
    // Use forward slashes for glob patterns on all platforms (tinyglobby requirement)
    const pattern = path.posix.join(rootDir.replace(/\\/g, '/'), 'projects', '**', '*.jsonl');
    const files = globSync([pattern], {
        absolute: true,  // Ensure we get absolute paths
        cwd: rootDir     // Set working directory to rootDir
    });

    if (files.length === 0)
        return null;

    // Step 2: Get file stats and sort by modification time (most recent first)
    const filesWithStats = files.map((file) => {
        const stats = statSync(file);
        return { file, mtime: stats.mtime };
    });

    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    // Step 3: Progressive lookback - start small and expand if needed
    // Start with 2x session duration (10 hours), expand to 48 hours if needed
    const lookbackChunks = [
        10,  // 2x session duration - catches most cases
        20,  // 4x session duration - catches longer sessions
        48   // Maximum lookback for marathon sessions
    ];

    let timestamps: Date[] = [];
    let mostRecentTimestamp: Date | null = null;
    let continuousWorkStart: Date | null = null;
    let foundSessionGap = false;

    for (const lookbackHours of lookbackChunks) {
        const cutoffTime = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
        timestamps = [];

        // Collect timestamps for this lookback period
        for (const { file, mtime } of filesWithStats) {
            if (mtime.getTime() < cutoffTime.getTime()) {
                break;
            }
            const fileTimestamps = getAllTimestampsFromFile(file);
            timestamps.push(...fileTimestamps);
        }

        if (timestamps.length === 0) {
            continue; // Try next chunk
        }

        // Sort timestamps (most recent first)
        timestamps.sort((a, b) => b.getTime() - a.getTime());

        // Get most recent timestamp (only set once)
        if (!mostRecentTimestamp && timestamps[0]) {
            mostRecentTimestamp = timestamps[0];

            // Check if the most recent activity is within the current session period
            const timeSinceLastActivity = now.getTime() - mostRecentTimestamp.getTime();
            if (timeSinceLastActivity > sessionDurationMs) {
                // No activity within the current session period
                return null;
            }
        }

        // Look for a session gap in this chunk
        continuousWorkStart = mostRecentTimestamp;
        for (let i = 1; i < timestamps.length; i++) {
            const currentTimestamp = timestamps[i];
            const previousTimestamp = timestamps[i - 1];

            if (!currentTimestamp || !previousTimestamp)
                continue;

            const gap = previousTimestamp.getTime() - currentTimestamp.getTime();

            if (gap >= sessionDurationMs) {
                // Found a true session boundary
                foundSessionGap = true;
                break;
            }

            continuousWorkStart = currentTimestamp;
        }

        // If we found a gap, we're done
        if (foundSessionGap) {
            break;
        }

        // If this was our last chunk, use what we have
        if (lookbackHours === lookbackChunks[lookbackChunks.length - 1]) {
            break;
        }
    }

    return buildCurrentBlockResult(timestamps, mostRecentTimestamp, continuousWorkStart, now, sessionDurationMs);
}

/**
 * Pure tail shared by the sync and async block scans: build the hour-aligned
 * blocks from the collected timestamps and find the one covering `now`.
 */
function buildCurrentBlockResult(
    timestamps: Date[],
    mostRecentTimestamp: Date | null,
    continuousWorkStart: Date | null,
    now: Date,
    sessionDurationMs: number
): BlockMetrics | null {
    if (!mostRecentTimestamp || !continuousWorkStart) {
        return null;
    }

    // Build actual blocks from timestamps going forward
    const blocks: { start: Date; end: Date }[] = [];
    const sortedTimestamps = timestamps.slice().sort((a, b) => a.getTime() - b.getTime());

    let currentBlockStart: Date | null = null;
    let currentBlockEnd: Date | null = null;

    for (const timestamp of sortedTimestamps) {
        if (timestamp.getTime() < continuousWorkStart.getTime())
            continue;

        if (!currentBlockStart || (currentBlockEnd && timestamp.getTime() > currentBlockEnd.getTime())) {
            // Start new block
            currentBlockStart = floorToHour(timestamp);
            currentBlockEnd = new Date(currentBlockStart.getTime() + sessionDurationMs);
            blocks.push({ start: currentBlockStart, end: currentBlockEnd });
        }
    }

    // Find current block
    for (const block of blocks) {
        if (now.getTime() >= block.start.getTime() && now.getTime() <= block.end.getTime()) {
            // Verify we have activity in this block
            const hasActivity = timestamps.some(t => t.getTime() >= block.start.getTime()
                && t.getTime() <= block.end.getTime()
            );

            if (hasActivity) {
                return {
                    startTime: block.start,
                    lastActivity: mostRecentTimestamp
                };
            }
        }
    }

    return null;
}

/**
 * Async twin of findMostRecentBlockStartTime (#18): same progressive-lookback
 * strategy over an async directory walk, so a large transcript tree never
 * blocks the daemon's render loop. The block-building tail is shared.
 */
async function findMostRecentBlockStartTimeAsync(
    rootDir: string,
    sessionDurationHours = 5
): Promise<BlockMetrics | null> {
    const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
    const now = new Date();

    const pattern = path.posix.join(rootDir.replace(/\\/g, '/'), 'projects', '**', '*.jsonl');
    const files = await glob([pattern], {
        absolute: true,
        cwd: rootDir
    });

    if (files.length === 0)
        return null;

    const filesWithStats = files.map((file) => {
        const stats = statSync(file);
        return { file, mtime: stats.mtime };
    });

    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const lookbackChunks = [10, 20, 48];

    let timestamps: Date[] = [];
    let mostRecentTimestamp: Date | null = null;
    let continuousWorkStart: Date | null = null;
    let foundSessionGap = false;

    for (const lookbackHours of lookbackChunks) {
        const cutoffTime = new Date(now.getTime() - lookbackHours * 60 * 60 * 1000);
        timestamps = [];

        for (const { file, mtime } of filesWithStats) {
            if (mtime.getTime() < cutoffTime.getTime()) {
                break;
            }
            const fileTimestamps = await getAllTimestampsFromFileAsync(file);
            timestamps.push(...fileTimestamps);
        }

        if (timestamps.length === 0) {
            continue;
        }

        timestamps.sort((a, b) => b.getTime() - a.getTime());

        if (!mostRecentTimestamp && timestamps[0]) {
            mostRecentTimestamp = timestamps[0];

            const timeSinceLastActivity = now.getTime() - mostRecentTimestamp.getTime();
            if (timeSinceLastActivity > sessionDurationMs) {
                return null;
            }
        }

        continuousWorkStart = mostRecentTimestamp;
        for (let i = 1; i < timestamps.length; i++) {
            const currentTimestamp = timestamps[i];
            const previousTimestamp = timestamps[i - 1];

            if (!currentTimestamp || !previousTimestamp)
                continue;

            const gap = previousTimestamp.getTime() - currentTimestamp.getTime();

            if (gap >= sessionDurationMs) {
                foundSessionGap = true;
                break;
            }

            continuousWorkStart = currentTimestamp;
        }

        if (foundSessionGap) {
            break;
        }

        if (lookbackHours === lookbackChunks[lookbackChunks.length - 1]) {
            break;
        }
    }

    return buildCurrentBlockResult(timestamps, mostRecentTimestamp, continuousWorkStart, now, sessionDurationMs);
}

/**
 * Gets all timestamps from a JSONL file
 */
function getAllTimestampsFromFile(filePath: string): Date[] {
    const timestamps: Date[] = [];
    try {
        for (const line of iterateJsonlLinesSync(filePath)) {
            collectTimestampFromLine(line, timestamps);
        }

        return timestamps;
    } catch {
        return [];
    }
}

async function getAllTimestampsFromFileAsync(filePath: string): Promise<Date[]> {
    const timestamps: Date[] = [];
    try {
        for await (const line of iterateJsonlLines(filePath)) {
            collectTimestampFromLine(line, timestamps);
        }

        return timestamps;
    } catch {
        return [];
    }
}

function collectTimestampFromLine(line: string, timestamps: Date[]): void {
    const json = parseJsonlLine(line) as {
        timestamp?: string;
        isSidechain?: boolean;
        message?: { usage?: { input_tokens?: number; output_tokens?: number } };
    } | null;
    if (!json) {
        return;
    }

    // Only treat entries with real token usage as block activity
    const usage = json.message?.usage;
    if (!usage)
        return;

    const hasInputTokens = typeof usage.input_tokens === 'number';
    const hasOutputTokens = typeof usage.output_tokens === 'number';
    if (!hasInputTokens || !hasOutputTokens)
        return;

    if (json.isSidechain === true)
        return;

    const timestamp = json.timestamp;
    if (typeof timestamp !== 'string')
        return;

    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime()))
        timestamps.push(date);
}

/**
 * Floors a timestamp to the beginning of the hour (matching existing logic)
 */
function floorToHour(timestamp: Date): Date {
    const floored = new Date(timestamp);
    floored.setUTCMinutes(0, 0, 0);
    return floored;
}
