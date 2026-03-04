import * as fs from 'fs';

import type {
    SpeedMetrics,
    TokenMetrics,
    TranscriptLine
} from '../types';

import {
    parseJsonlLine,
    readJsonlLines
} from './jsonl-lines';

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

export async function getSpeedMetrics(transcriptPath: string): Promise<SpeedMetrics> {
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

        const lines = await readJsonlLines(transcriptPath);

        let inputTokens = 0;
        let outputTokens = 0;
        let requestCount = 0;
        let activeDurationMs = 0;

        let lastUserTimestamp: Date | null = null;
        let lastAssistantTimestamp: Date | null = null;

        for (const line of lines) {
            const data = parseJsonlLine(line) as TranscriptLine | null;
            if (!data || data.isSidechain === true || data.isApiErrorMessage) {
                continue;
            }

            const entryTimestamp = parseTimestamp(data.timestamp);

            if (data.type === 'user' && entryTimestamp) {
                if (lastUserTimestamp && lastAssistantTimestamp) {
                    const processingTime = lastAssistantTimestamp.getTime() - lastUserTimestamp.getTime();
                    if (processingTime > 0) {
                        activeDurationMs += processingTime;
                    }
                }

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

        if (lastUserTimestamp && lastAssistantTimestamp) {
            const processingTime = lastAssistantTimestamp.getTime() - lastUserTimestamp.getTime();
            if (processingTime > 0) {
                activeDurationMs += processingTime;
            }
        }

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