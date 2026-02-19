import * as fs from 'fs';
import path from 'node:path';
import { globSync } from 'tinyglobby';
import { promisify } from 'util';

import type {
    BlockMetrics,
    BlockTokenMetrics,
    TokenMetrics,
    TranscriptLine
} from '../types';

import { getClaudeConfigDir } from './claude-settings';
import { estimateCostUsd } from './pricing';

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
                    // Also skip API error messages (synthetic messages with 0 tokens)
                    if (data.isSidechain !== true && data.timestamp && !data.isApiErrorMessage) {
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
 * Gets all timestamps from a JSONL file
 */
function getAllTimestampsFromFile(filePath: string): Date[] {
    const timestamps: Date[] = [];
    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);

        for (const line of lines) {
            try {
                const json = JSON.parse(line) as {
                    timestamp?: string;
                    isSidechain?: boolean;
                    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
                };

                // Only treat entries with real token usage as block activity
                const usage = json.message?.usage;
                if (!usage)
                    continue;

                const hasInputTokens = typeof usage.input_tokens === 'number';
                const hasOutputTokens = typeof usage.output_tokens === 'number';
                if (!hasInputTokens || !hasOutputTokens)
                    continue;

                if (json.isSidechain === true)
                    continue;

                const timestamp = json.timestamp;
                if (typeof timestamp !== 'string')
                    continue;

                const date = new Date(timestamp);
                if (!Number.isNaN(date.getTime()))
                    timestamps.push(date);
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

// Cache for block token metrics per file (keyed by filepath, invalidated by mtime)
const blockTokenCache = new Map<string, { mtimeMs: number; metrics: BlockTokenMetrics }>();

// Cache for estimated max tokens (recomputed hourly)
const FALLBACK_MAX_TOKENS = 5_000_000;
const MIN_MAX_TOKENS = 1_000_000;
const MAX_CACHE_TTL_MS = 3600 * 1000; // 1 hour
let maxCache: { tokens: number; costUsd: number; isEstimated: boolean; computedAt: number } | null = null;

/**
 * Sums token usage from a single JSONL file for entries within the block timeframe.
 * Results are cached by file path + mtime.
 */
function getFileBlockTokens(filePath: string, blockStart: Date, blockEnd: Date): BlockTokenMetrics {
    const empty: BlockTokenMetrics = {
        inputTokens: 0, outputTokens: 0,
        cacheCreationTokens: 0, cacheReadTokens: 0,
        totalTokens: 0, readCostUsd: 0, writeCostUsd: 0, estimatedCostUsd: 0,
        estimatedMaxTokens: 0, estimatedMaxCostUsd: 0, isMaxEstimated: true
    };

    try {
        const stats = statSync(filePath);

        // Skip files not modified since block start
        if (stats.mtime.getTime() < blockStart.getTime()) {
            return empty;
        }

        // Check cache
        const cached = blockTokenCache.get(filePath);
        if (cached && cached.mtimeMs === stats.mtimeMs) {
            return cached.metrics;
        }

        const content = readFileSync(filePath, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line.length > 0);

        let inputTokens = 0;
        let outputTokens = 0;
        let cacheCreationTokens = 0;
        let cacheReadTokens = 0;
        let readCostUsd = 0;
        let writeCostUsd = 0;

        for (const line of lines) {
            // Quick pre-filter for performance
            if (!line.includes('"usage"')) {
                continue;
            }

            try {
                const data = JSON.parse(line) as TranscriptLine;
                const usage = data.message?.usage;
                if (!usage)
                    continue;
                if (data.isSidechain === true)
                    continue;

                // Filter by timestamp within block
                if (data.timestamp) {
                    const entryTime = new Date(data.timestamp);
                    if (entryTime.getTime() < blockStart.getTime() || entryTime.getTime() > blockEnd.getTime()) {
                        continue;
                    }
                }

                const inp = usage.input_tokens || 0;
                const out = usage.output_tokens || 0;
                const cc = usage.cache_creation_input_tokens ?? 0;
                const cr = usage.cache_read_input_tokens ?? 0;
                const modelId = data.message?.model;

                inputTokens += inp;
                outputTokens += out;
                cacheCreationTokens += cc;
                cacheReadTokens += cr;
                readCostUsd += estimateCostUsd(inp, 0, cc, cr, modelId);
                writeCostUsd += estimateCostUsd(0, out, 0, 0, modelId);
            } catch {
                continue;
            }
        }

        const totalTokens = inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens;
        const estimatedCostUsd = readCostUsd + writeCostUsd;

        const metrics: BlockTokenMetrics = {
            inputTokens, outputTokens,
            cacheCreationTokens, cacheReadTokens,
            totalTokens, readCostUsd, writeCostUsd, estimatedCostUsd,
            estimatedMaxTokens: 0, estimatedMaxCostUsd: 0, isMaxEstimated: true
        };

        blockTokenCache.set(filePath, { mtimeMs: stats.mtimeMs, metrics });
        return metrics;
    } catch {
        return empty;
    }
}

interface EstimatedMax {
    tokens: number;
    costUsd: number;
    isEstimated: boolean;
}

/**
 * Estimates the max tokens and cost per block by scanning historical blocks (last 14 days).
 * Finds the block with the highest total token usage among completed blocks.
 * Results are cached for 1 hour.
 */
function getEstimatedMax(claudeDir: string, currentBlockStart: Date): EstimatedMax {
    const now = Date.now();
    if (maxCache && (now - maxCache.computedAt) < MAX_CACHE_TTL_MS) {
        return { tokens: maxCache.tokens, costUsd: maxCache.costUsd, isEstimated: maxCache.isEstimated };
    }

    const sessionDurationMs = 5 * 60 * 60 * 1000;
    const lookbackMs = 14 * 24 * 60 * 60 * 1000; // 14 days
    const cutoffTime = new Date(now - lookbackMs);

    const pattern = path.posix.join(claudeDir.replace(/\\/g, '/'), 'projects', '**', '*.jsonl');
    const files = globSync([pattern], { absolute: true, cwd: claudeDir });

    // Collect timestamps + token/cost data from files modified in lookback period
    interface Entry { time: Date; tokens: number; costUsd: number }
    const entries: Entry[] = [];

    for (const file of files) {
        try {
            const stats = statSync(file);
            if (stats.mtime.getTime() < cutoffTime.getTime()) {
                continue;
            }

            const content = readFileSync(file, 'utf-8');
            const lines = content.trim().split('\n').filter(line => line.length > 0);

            for (const line of lines) {
                if (!line.includes('"usage"')) {
                    continue;
                }

                try {
                    const data = JSON.parse(line) as TranscriptLine;
                    const usage = data.message?.usage;
                    if (!usage)
                        continue;
                    if (data.isSidechain === true)
                        continue;
                    if (!data.timestamp)
                        continue;

                    const entryTime = new Date(data.timestamp);
                    if (Number.isNaN(entryTime.getTime()))
                        continue;

                    const inp = usage.input_tokens || 0;
                    const out = usage.output_tokens || 0;
                    const cc = usage.cache_creation_input_tokens ?? 0;
                    const cr = usage.cache_read_input_tokens ?? 0;

                    const tokens = inp + out + cc + cr;
                    const costUsd = estimateCostUsd(inp, out, cc, cr, data.message?.model);

                    entries.push({ time: entryTime, tokens, costUsd });
                } catch {
                    continue;
                }
            }
        } catch {
            continue;
        }
    }

    const fallback: EstimatedMax = { tokens: FALLBACK_MAX_TOKENS, costUsd: 0, isEstimated: true };

    if (entries.length === 0) {
        maxCache = { tokens: fallback.tokens, costUsd: fallback.costUsd, isEstimated: true, computedAt: now };
        return fallback;
    }

    entries.sort((a, b) => a.time.getTime() - b.time.getTime());

    // Group entries into 5-hour blocks, track the block with the highest token total
    let currentStart: Date | null = null;
    let currentEnd: Date | null = null;
    let blockTokens = 0;
    let blockCost = 0;
    let maxBlockTokens = 0;
    let maxBlockCost = 0;

    for (const entry of entries) {
        if (!currentStart || !currentEnd || entry.time.getTime() > currentEnd.getTime()) {
            // Save previous block (skip the current active block)
            if (currentStart && currentStart.getTime() !== currentBlockStart.getTime()) {
                if (blockTokens > maxBlockTokens) {
                    maxBlockTokens = blockTokens;
                    maxBlockCost = blockCost;
                }
            }
            currentStart = floorToHour(entry.time);
            currentEnd = new Date(currentStart.getTime() + sessionDurationMs);
            blockTokens = 0;
            blockCost = 0;
        }
        blockTokens += entry.tokens;
        blockCost += entry.costUsd;
    }

    // Don't count the current block in the max
    if (currentStart && currentStart.getTime() !== currentBlockStart.getTime()) {
        if (blockTokens > maxBlockTokens) {
            maxBlockTokens = blockTokens;
            maxBlockCost = blockCost;
        }
    }

    const isEstimated = maxBlockTokens === 0 || maxBlockTokens < MIN_MAX_TOKENS;
    const resultTokens = maxBlockTokens > 0 ? Math.max(maxBlockTokens, MIN_MAX_TOKENS) : FALLBACK_MAX_TOKENS;
    const resultCost = maxBlockCost;
    maxCache = { tokens: resultTokens, costUsd: resultCost, isEstimated, computedAt: now };
    return { tokens: resultTokens, costUsd: resultCost, isEstimated };
}

/**
 * Gets total token usage across all sessions in the current 5-hour block.
 * Requires blockMetrics to determine the block timeframe.
 */
export function getBlockTokenMetrics(blockMetrics: BlockMetrics): BlockTokenMetrics {
    const claudeDir = getClaudeConfigDir();
    if (!claudeDir) {
        return {
            inputTokens: 0, outputTokens: 0,
            cacheCreationTokens: 0, cacheReadTokens: 0,
            totalTokens: 0, readCostUsd: 0, writeCostUsd: 0, estimatedCostUsd: 0,
            estimatedMaxTokens: FALLBACK_MAX_TOKENS, estimatedMaxCostUsd: 0,
            isMaxEstimated: true
        };
    }

    const blockStart = blockMetrics.startTime;
    const blockEnd = new Date(blockStart.getTime() + 5 * 60 * 60 * 1000);

    // Find all JSONL files
    const pattern = path.posix.join(claudeDir.replace(/\\/g, '/'), 'projects', '**', '*.jsonl');
    const files = globSync([pattern], { absolute: true, cwd: claudeDir });

    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreation = 0;
    let totalCacheRead = 0;
    let totalReadCost = 0;
    let totalWriteCost = 0;

    for (const file of files) {
        const metrics = getFileBlockTokens(file, blockStart, blockEnd);
        totalInput += metrics.inputTokens;
        totalOutput += metrics.outputTokens;
        totalCacheCreation += metrics.cacheCreationTokens;
        totalCacheRead += metrics.cacheReadTokens;
        totalReadCost += metrics.readCostUsd;
        totalWriteCost += metrics.writeCostUsd;
    }

    const totalTokens = totalInput + totalOutput + totalCacheCreation + totalCacheRead;
    const estimatedMax = getEstimatedMax(claudeDir, blockStart);

    return {
        inputTokens: totalInput,
        outputTokens: totalOutput,
        cacheCreationTokens: totalCacheCreation,
        cacheReadTokens: totalCacheRead,
        totalTokens,
        readCostUsd: totalReadCost,
        writeCostUsd: totalWriteCost,
        estimatedCostUsd: totalReadCost + totalWriteCost,
        estimatedMaxTokens: estimatedMax.tokens,
        estimatedMaxCostUsd: estimatedMax.costUsd,
        isMaxEstimated: estimatedMax.isEstimated
    };
}

/**
 * Floors a timestamp to the beginning of the hour (matching existing logic)
 */
function floorToHour(timestamp: Date): Date {
    const floored = new Date(timestamp);
    floored.setUTCMinutes(0, 0, 0);
    return floored;
}