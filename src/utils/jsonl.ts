import * as fs from 'fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import { promisify } from 'util';

import type {
    BlockMetrics,
    TokenMetrics,
    TranscriptLine
} from '../types';

// Ensure fs.promises compatibility for older Node versions
const readFile = promisify(fs.readFile);
const readFileSync = fs.readFileSync;
const statSync = fs.statSync;

export async function getSessionDuration(transcriptPath: string): Promise<string | null> {
    try {
        if (!fs.existsSync(transcriptPath)) {
            return null;
        }

        const content = await readFile(transcriptPath, 'utf-8');
        const lines = content.trim().split('\n').filter((line: string) => line.trim());

        if (lines.length === 0) {
            return null;
        }

        let firstTimestamp: Date | null = null;
        let lastTimestamp: Date | null = null;

        // Find first valid timestamp
        for (const line of lines) {
            try {
                const data = JSON.parse(line) as { timestamp?: string };
                if (data.timestamp) {
                    firstTimestamp = new Date(data.timestamp);
                    break;
                }
            } catch {
                // Skip invalid lines
            }
        }

        // Find last valid timestamp (iterate backwards)
        for (let i = lines.length - 1; i >= 0; i--) {
            try {
                const data = JSON.parse(lines[i] ?? '') as { timestamp?: string };
                if (data.timestamp) {
                    lastTimestamp = new Date(data.timestamp);
                    break;
                }
            } catch {
                // Skip invalid lines
            }
        }

        if (!firstTimestamp || !lastTimestamp) {
            return null;
        }

        // Calculate duration in milliseconds
        const durationMs = lastTimestamp.getTime() - firstTimestamp.getTime();

        // Convert to minutes
        const totalMinutes = Math.floor(durationMs / (1000 * 60));

        if (totalMinutes < 1) {
            return '<1m';
        }

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours === 0) {
            return `${minutes}m`;
        } else if (minutes === 0) {
            return `${hours}hr`;
        } else {
            return `${hours}hr ${minutes}m`;
        }
    } catch {
        return null;
    }
}

export async function getTokenMetrics(transcriptPath: string): Promise<TokenMetrics> {
    try {
        // Use Node.js-compatible file reading
        if (!fs.existsSync(transcriptPath)) {
            return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: 0 };
        }

        const content = await readFile(transcriptPath, 'utf-8');
        const lines = content.trim().split('\n');

        let inputTokens = 0;
        let outputTokens = 0;
        let cachedTokens = 0;
        let contextLength = 0;

        // Parse each line and sum up token usage for totals
        let mostRecentMainChainEntry: TranscriptLine | null = null;
        let mostRecentTimestamp: Date | null = null;

        for (const line of lines) {
            try {
                const data = JSON.parse(line) as TranscriptLine;
                if (data.message?.usage) {
                    inputTokens += data.message.usage.input_tokens || 0;
                    outputTokens += data.message.usage.output_tokens || 0;
                    cachedTokens += data.message.usage.cache_read_input_tokens ?? 0;
                    cachedTokens += data.message.usage.cache_creation_input_tokens ?? 0;

                    // Track the most recent entry with isSidechain: false (or undefined, which defaults to main chain)
                    if (data.isSidechain !== true && data.timestamp) {
                        const entryTime = new Date(data.timestamp);
                        if (!mostRecentTimestamp || entryTime > mostRecentTimestamp) {
                            mostRecentTimestamp = entryTime;
                            mostRecentMainChainEntry = data;
                        }
                    }
                }
            } catch {
                // Skip invalid JSON lines
            }
        }

        // Calculate context length from the most recent main chain message
        if (mostRecentMainChainEntry?.message?.usage) {
            const usage = mostRecentMainChainEntry.message.usage;
            contextLength = (usage.input_tokens || 0)
                + (usage.cache_read_input_tokens ?? 0)
                + (usage.cache_creation_input_tokens ?? 0);
        }

        const totalTokens = inputTokens + outputTokens + cachedTokens;

        return { inputTokens, outputTokens, cachedTokens, totalTokens, contextLength };
    } catch {
        return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0, contextLength: 0 };
    }
}

/**
 * Gets block metrics for the current 5-hour block from JSONL files
 */
export function getBlockMetrics(transcriptPath: string | undefined): BlockMetrics | null {
    if (!transcriptPath || typeof transcriptPath !== 'string') {
        return null;
    }

    // Walk up the directory tree to find .claude folder
    let currentPath = path.dirname(transcriptPath);
    let claudePath: string | null = null;

    while (currentPath && currentPath !== path.dirname(currentPath)) {
        const baseName = path.basename(currentPath);
        if (baseName === '.claude') {
            claudePath = currentPath;
            break;
        }
        currentPath = path.dirname(currentPath);
    }

    if (!claudePath)
        return null;

    try {
        return findMostRecentBlockStartTime(claudePath);
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
    const pattern = path.join(rootDir, 'projects', '**', '*.jsonl').replace(/\\/g, '/');
    const files = globSync([pattern]);

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

    if (!mostRecentTimestamp || !continuousWorkStart) {
        return null;
    }

    // Floor the continuous work start to the hour
    const flooredWorkStart = floorToHour(continuousWorkStart);

    // Calculate how long we've been working from the floored start time
    const totalWorkTime = now.getTime() - flooredWorkStart.getTime();

    // If we've been working for more than one session, find the current block
    let blockStart = flooredWorkStart;
    if (totalWorkTime > sessionDurationMs) {
        // Calculate how many complete 5-hour blocks have passed
        const completedBlocks = Math.floor(totalWorkTime / sessionDurationMs);
        // The current block started after the completed blocks
        blockStart = new Date(flooredWorkStart.getTime() + (completedBlocks * sessionDurationMs));
    }

    const blockEnd = new Date(blockStart.getTime() + sessionDurationMs);
    const inBlockWindow = now.getTime() >= blockStart.getTime() && now.getTime() <= blockEnd.getTime();
    const activityInThisBlock = mostRecentTimestamp.getTime() >= blockStart.getTime() && mostRecentTimestamp.getTime() <= now.getTime();

    const isActive = inBlockWindow && activityInThisBlock;
    if (!isActive)
        return null;

    return {
        startTime: blockStart,
        lastActivity: mostRecentTimestamp
    };
}

/**
 * Gets all timestamps from a JSONL file
 */
function getAllTimestampsFromFile(filePath: string): Date[] {
    const timestamps: Date[] = [];
    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);

        for (const line of lines) {
            try {
                const json = JSON.parse(line) as { timestamp?: string };
                if (json.timestamp && typeof json.timestamp === 'string') {
                    const date = new Date(json.timestamp);
                    if (!Number.isNaN(date.getTime())) {
                        timestamps.push(date);
                    }
                }
            } catch {
                // Skip invalid JSON lines
                continue;
            }
        }

        return timestamps;
    } catch {
        return [];
    }
}

/**
 * Floors a timestamp to the beginning of the hour (matching existing logic)
 */
function floorToHour(timestamp: Date): Date {
    const floored = new Date(timestamp);
    floored.setUTCMinutes(0, 0, 0);
    return floored;
}