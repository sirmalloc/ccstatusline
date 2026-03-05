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

interface SpeedMetricsOptions { includeSubagents?: boolean }

interface SpeedInterval {
    startMs: number;
    endMs: number;
}

interface CollectedSpeedMetrics {
    inputTokens: number;
    outputTokens: number;
    requestCount: number;
    intervals: SpeedInterval[];
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

function addInterval(intervals: SpeedInterval[], start: Date | null, end: Date | null) {
    if (!start || !end) {
        return;
    }

    const startMs = start.getTime();
    const endMs = end.getTime();
    if (endMs > startMs) {
        intervals.push({ startMs, endMs });
    }
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

function collectSpeedMetricsFromLines(lines: string[], ignoreSidechain: boolean): CollectedSpeedMetrics {
    let inputTokens = 0;
    let outputTokens = 0;
    let requestCount = 0;
    const intervals: SpeedInterval[] = [];

    let lastUserTimestamp: Date | null = null;
    let lastAssistantTimestamp: Date | null = null;

    for (const line of lines) {
        const data = parseJsonlLine(line) as TranscriptLine | null;
        if (!data || data.isApiErrorMessage) {
            continue;
        }

        if (ignoreSidechain && data.isSidechain === true) {
            continue;
        }

        const entryTimestamp = parseTimestamp(data.timestamp);

        if (data.type === 'user' && entryTimestamp) {
            addInterval(intervals, lastUserTimestamp, lastAssistantTimestamp);
            lastUserTimestamp = entryTimestamp;
            lastAssistantTimestamp = null;
            continue;
        }

        if (data.type === 'assistant' && data.message?.usage) {
            inputTokens += data.message.usage.input_tokens || 0;
            outputTokens += data.message.usage.output_tokens || 0;
            requestCount++;

            if (entryTimestamp) {
                lastAssistantTimestamp = entryTimestamp;
            }
        }
    }

    addInterval(intervals, lastUserTimestamp, lastAssistantTimestamp);

    return {
        inputTokens,
        outputTokens,
        requestCount,
        intervals
    };
}

function getSubagentTranscriptPaths(transcriptPath: string): string[] {
    const subagentsDir = path.join(path.dirname(transcriptPath), 'subagents');
    if (!fs.existsSync(subagentsDir)) {
        return [];
    }

    try {
        const dirEntries = fs.readdirSync(subagentsDir, { withFileTypes: true });
        return dirEntries
            .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
            .map(entry => path.join(subagentsDir, entry.name));
    } catch {
        return [];
    }
}

export async function getSpeedMetrics(
    transcriptPath: string,
    options: SpeedMetricsOptions = {}
): Promise<SpeedMetrics> {
    const emptyMetrics: SpeedMetrics = {
        totalDurationMs: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        requestCount: 0
    };

    try {
        if (!fs.existsSync(transcriptPath)) {
            return emptyMetrics;
        }

        const mainLines = await readJsonlLines(transcriptPath);
        const mainMetrics = collectSpeedMetricsFromLines(mainLines, true);

        let inputTokens = mainMetrics.inputTokens;
        let outputTokens = mainMetrics.outputTokens;
        let requestCount = mainMetrics.requestCount;
        const allIntervals: SpeedInterval[] = [...mainMetrics.intervals];

        if (options.includeSubagents === true) {
            const subagentPaths = getSubagentTranscriptPaths(transcriptPath);
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

                inputTokens += subagentMetrics.inputTokens;
                outputTokens += subagentMetrics.outputTokens;
                requestCount += subagentMetrics.requestCount;
                allIntervals.push(...subagentMetrics.intervals);
            }
        }

        const mergedIntervals = mergeIntervals(allIntervals);
        const activeDurationMs = getIntervalsDurationMs(mergedIntervals);

        return {
            totalDurationMs: activeDurationMs,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            requestCount
        };
    } catch {
        return emptyMetrics;
    }
}