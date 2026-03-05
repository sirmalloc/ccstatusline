import * as fs from 'fs';
import path from 'node:path';

import type {
    SpeedMetrics,
    TokenMetrics,
    TranscriptLine
} from '../types';

import {
    parseJsonlLine,
    readJsonlLines
} from './jsonl-lines';

export interface SpeedMetricsOptions {
    includeSubagents?: boolean;
    windowSeconds?: number;
}

interface SpeedMetricsCollectionOptions {
    includeSubagents?: boolean;
    windowSeconds?: number[];
}

export interface SpeedMetricsCollection {
    sessionAverage: SpeedMetrics;
    windowed: Record<string, SpeedMetrics>;
}

interface SpeedInterval {
    startMs: number;
    endMs: number;
}

interface SpeedRequest {
    inputTokens: number;
    outputTokens: number;
    assistantTimestampMs: number | null;
    interval: SpeedInterval | null;
}

interface CollectedSpeedMetrics {
    requests: SpeedRequest[];
    latestTimestampMs: number | null;
}

function collectAgentIds(value: unknown, agentIds: Set<string>) {
    if (!value || typeof value !== 'object') {
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectAgentIds(item, agentIds);
        }
        return;
    }

    for (const [key, nestedValue] of Object.entries(value)) {
        if (key === 'agentId' && typeof nestedValue === 'string' && nestedValue.trim() !== '') {
            agentIds.add(nestedValue);
            continue;
        }

        collectAgentIds(nestedValue, agentIds);
    }
}

function getReferencedSubagentIds(lines: string[]): Set<string> {
    const agentIds = new Set<string>();

    for (const line of lines) {
        const data = parseJsonlLine(line);
        if (!data) {
            continue;
        }

        collectAgentIds(data, agentIds);
    }

    return agentIds;
}

export async function getSessionDuration(transcriptPath: string): Promise<string | null> {
    try {
        if (!fs.existsSync(transcriptPath)) {
            return null;
        }

        const lines = await readJsonlLines(transcriptPath);

        if (lines.length === 0) {
            return null;
        }

        let firstTimestamp: Date | null = null;
        let lastTimestamp: Date | null = null;

        // Find first valid timestamp
        for (const line of lines) {
            const data = parseJsonlLine(line) as { timestamp?: string } | null;
            if (data?.timestamp) {
                firstTimestamp = new Date(data.timestamp);
                break;
            }
        }

        // Find last valid timestamp (iterate backwards)
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            if (!line) {
                continue;
            }

            const data = parseJsonlLine(line) as { timestamp?: string } | null;
            if (data?.timestamp) {
                lastTimestamp = new Date(data.timestamp);
                break;
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

        const lines = await readJsonlLines(transcriptPath);

        let inputTokens = 0;
        let outputTokens = 0;
        let cachedTokens = 0;
        let contextLength = 0;

        // Parse each line and sum up token usage for totals
        let mostRecentMainChainEntry: TranscriptLine | null = null;
        let mostRecentTimestamp: Date | null = null;

        for (const line of lines) {
            const data = parseJsonlLine(line) as TranscriptLine | null;
            if (data?.message?.usage) {
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

function parseTimestamp(value: string | undefined): Date | null {
    if (!value) {
        return null;
    }

    const timestamp = new Date(value);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function mergeIntervals(intervals: SpeedInterval[]): SpeedInterval[] {
    if (intervals.length === 0) {
        return [];
    }

    const sorted = intervals
        .slice()
        .sort((a, b) => a.startMs - b.startMs);
    const first = sorted[0];
    if (!first) {
        return [];
    }
    const merged: SpeedInterval[] = [{ ...first }];

    for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = merged[merged.length - 1];
        if (!current || !last) {
            continue;
        }

        if (current.startMs <= last.endMs) {
            last.endMs = Math.max(last.endMs, current.endMs);
        } else {
            merged.push({ ...current });
        }
    }

    return merged;
}

function getIntervalsDurationMs(intervals: SpeedInterval[]): number {
    return intervals.reduce((total, interval) => total + (interval.endMs - interval.startMs), 0);
}

function createEmptySpeedMetrics(): SpeedMetrics {
    return {
        totalDurationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestCount: 0
    };
}

function normalizeWindowSeconds(value: number | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return null;
    }

    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : null;
}

function collectSpeedMetricsFromLines(lines: string[], ignoreSidechain: boolean): CollectedSpeedMetrics {
    const requests: SpeedRequest[] = [];

    let lastUserTimestamp: Date | null = null;
    let latestTimestampMs: number | null = null;

    for (const line of lines) {
        const data = parseJsonlLine(line) as TranscriptLine | null;
        if (!data || data.isApiErrorMessage) {
            continue;
        }

        if (ignoreSidechain && data.isSidechain === true) {
            continue;
        }

        const entryTimestamp = parseTimestamp(data.timestamp);
        if (entryTimestamp) {
            const entryTimestampMs = entryTimestamp.getTime();
            if (latestTimestampMs === null || entryTimestampMs > latestTimestampMs) {
                latestTimestampMs = entryTimestampMs;
            }
        }

        if (data.type === 'user' && entryTimestamp) {
            lastUserTimestamp = entryTimestamp;
            continue;
        }

        if (data.type === 'assistant' && data.message?.usage) {
            const inputTokens = data.message.usage.input_tokens || 0;
            const outputTokens = data.message.usage.output_tokens || 0;
            let interval: SpeedInterval | null = null;
            if (entryTimestamp && lastUserTimestamp) {
                const startMs = lastUserTimestamp.getTime();
                const endMs = entryTimestamp.getTime();
                if (endMs > startMs) {
                    interval = { startMs, endMs };
                }
            }

            requests.push({
                inputTokens,
                outputTokens,
                assistantTimestampMs: entryTimestamp ? entryTimestamp.getTime() : null,
                interval
            });
        }
    }

    return {
        requests,
        latestTimestampMs
    };
}

function mergeCollectedSpeedMetrics(parts: CollectedSpeedMetrics[]): CollectedSpeedMetrics {
    const requests: SpeedRequest[] = [];
    let latestTimestampMs: number | null = null;

    for (const part of parts) {
        requests.push(...part.requests);

        if (part.latestTimestampMs !== null && (latestTimestampMs === null || part.latestTimestampMs > latestTimestampMs)) {
            latestTimestampMs = part.latestTimestampMs;
        }
    }

    return {
        requests,
        latestTimestampMs
    };
}

function buildSpeedMetrics(
    collected: CollectedSpeedMetrics,
    windowSeconds?: number
): SpeedMetrics {
    const normalizedWindowSeconds = normalizeWindowSeconds(windowSeconds);
    if (normalizedWindowSeconds !== null && collected.latestTimestampMs === null) {
        return createEmptySpeedMetrics();
    }

    const windowEndMs = normalizedWindowSeconds !== null && collected.latestTimestampMs !== null
        ? collected.latestTimestampMs
        : null;
    const windowStartMs = normalizedWindowSeconds !== null && windowEndMs !== null
        ? windowEndMs - (normalizedWindowSeconds * 1000)
        : null;

    const selectedRequests = normalizedWindowSeconds !== null && windowStartMs !== null && windowEndMs !== null
        ? collected.requests.filter(request => request.assistantTimestampMs !== null
            && request.assistantTimestampMs >= windowStartMs
            && request.assistantTimestampMs <= windowEndMs
        )
        : collected.requests;

    let inputTokens = 0;
    let outputTokens = 0;
    const intervals: SpeedInterval[] = [];

    for (const request of selectedRequests) {
        inputTokens += request.inputTokens;
        outputTokens += request.outputTokens;

        if (!request.interval) {
            continue;
        }

        if (windowStartMs === null || windowEndMs === null) {
            intervals.push(request.interval);
            continue;
        }

        const clippedStartMs = Math.max(request.interval.startMs, windowStartMs);
        const clippedEndMs = Math.min(request.interval.endMs, windowEndMs);
        if (clippedEndMs > clippedStartMs) {
            intervals.push({
                startMs: clippedStartMs,
                endMs: clippedEndMs
            });
        }
    }

    const mergedIntervals = mergeIntervals(intervals);
    const totalDurationMs = getIntervalsDurationMs(mergedIntervals);

    return {
        totalDurationMs,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        requestCount: selectedRequests.length
    };
}

function buildEmptyWindowedMetrics(windowSeconds: number[]): Record<string, SpeedMetrics> {
    const windowed: Record<string, SpeedMetrics> = {};
    for (const window of windowSeconds) {
        windowed[window.toString()] = createEmptySpeedMetrics();
    }
    return windowed;
}

function getSubagentTranscriptPaths(transcriptPath: string, referencedAgentIds: Set<string>): string[] {
    if (referencedAgentIds.size === 0) {
        return [];
    }

    const transcriptDir = path.dirname(transcriptPath);
    const transcriptStem = path.parse(transcriptPath).name;
    const candidateDirs = [
        path.join(transcriptDir, 'subagents'),
        path.join(transcriptDir, transcriptStem, 'subagents')
    ];
    const seenPaths = new Set<string>();
    const matchedPaths: string[] = [];

    for (const subagentsDir of candidateDirs) {
        if (!fs.existsSync(subagentsDir)) {
            continue;
        }

        try {
            const dirEntries = fs.readdirSync(subagentsDir, { withFileTypes: true });
            for (const entry of dirEntries) {
                if (!entry.isFile()) {
                    continue;
                }

                const match = /^agent-(.+)\.jsonl$/.exec(entry.name);
                if (!match?.[1]) {
                    continue;
                }

                if (!referencedAgentIds.has(match[1])) {
                    continue;
                }

                const fullPath = path.join(subagentsDir, entry.name);
                if (seenPaths.has(fullPath)) {
                    continue;
                }

                seenPaths.add(fullPath);
                matchedPaths.push(fullPath);
            }
        } catch {
            continue;
        }
    }

    return matchedPaths;
}

export async function getSpeedMetricsCollection(
    transcriptPath: string,
    options: SpeedMetricsCollectionOptions = {}
): Promise<SpeedMetricsCollection> {
    const normalizedWindows = Array.from(
        new Set(
            (options.windowSeconds ?? [])
                .map(window => normalizeWindowSeconds(window))
                .filter((window): window is number => window !== null)
        )
    );
    const emptyWindowedMetrics = buildEmptyWindowedMetrics(normalizedWindows);

    try {
        if (!fs.existsSync(transcriptPath)) {
            return {
                sessionAverage: createEmptySpeedMetrics(),
                windowed: emptyWindowedMetrics
            };
        }

        const mainLines = await readJsonlLines(transcriptPath);
        const allCollected: CollectedSpeedMetrics[] = [
            collectSpeedMetricsFromLines(mainLines, true)
        ];

        if (options.includeSubagents === true) {
            const referencedSubagentIds = getReferencedSubagentIds(mainLines);
            const subagentPaths = getSubagentTranscriptPaths(transcriptPath, referencedSubagentIds);
            const subagentMetricsResults = await Promise.all(subagentPaths.map(async (subagentPath) => {
                try {
                    const subagentLines = await readJsonlLines(subagentPath);
                    return collectSpeedMetricsFromLines(subagentLines, false);
                } catch {
                    return null;
                }
            }));

            for (const subagentMetrics of subagentMetricsResults) {
                if (!subagentMetrics) {
                    continue;
                }

                allCollected.push(subagentMetrics);
            }
        }

        const combined = mergeCollectedSpeedMetrics(allCollected);
        const windowed: Record<string, SpeedMetrics> = {};
        for (const window of normalizedWindows) {
            windowed[window.toString()] = buildSpeedMetrics(combined, window);
        }

        return {
            sessionAverage: buildSpeedMetrics(combined),
            windowed
        };
    } catch {
        return {
            sessionAverage: createEmptySpeedMetrics(),
            windowed: emptyWindowedMetrics
        };
    }
}

export async function getSpeedMetrics(
    transcriptPath: string,
    options: SpeedMetricsOptions = {}
): Promise<SpeedMetrics> {
    const requestedWindow = normalizeWindowSeconds(options.windowSeconds);
    const metricsCollection = await getSpeedMetricsCollection(transcriptPath, {
        includeSubagents: options.includeSubagents,
        windowSeconds: requestedWindow ? [requestedWindow] : []
    });

    if (requestedWindow === null) {
        return metricsCollection.sessionAverage;
    }

    return metricsCollection.windowed[requestedWindow.toString()] ?? createEmptySpeedMetrics();
}