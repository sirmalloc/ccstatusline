import * as fs from 'node:fs';
import { globSync } from 'tinyglobby';

import type { BlockMetrics } from '../types';

import { getClaudeConfigDir } from './claude-settings';
import {
    iterateJsonlLinesReverseSync,
    parseJsonlLine
} from './jsonl-lines';

const statSync = fs.statSync;

/**
 * How far past a lookback cutoff a transcript is read before it stops. Rows
 * are appended in time order, but not strictly: this slack keeps a row that
 * landed slightly out of order from ending the read early
 */
const READ_PAST_CUTOFF_MS = 60 * 60 * 1000;

/**
 * Only rows that carry usage can be block activity or stop a read. Lines
 * without this key (tool results, file snapshots), which are often the
 * largest in a transcript, are skipped before they are decoded or parsed
 */
const USAGE_KEY = '"usage"';

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
 * Furthest back a block chain is followed, by a full scan or from a cached block
 */
const MAX_LOOKBACK_MS = 48 * 60 * 60 * 1000;

/**
 * Carries a known block forward to the current one, reading only the activity
 * since that block ended
 *
 * @remarks
 * Blocks chain: each one starts at the first activity after the previous one
 * ends. A full scan has to find where continuous work began to place the
 * chain, and under continuous use that means reading back the full lookback
 * on every block. Starting from the last block found keeps the chain where
 * the scan put it and reads at most the hours since then.
 *
 * @returns The current block, null when there is none, or undefined when the
 * previous block is too old to start from and a full scan is needed
 */
export function advanceBlockChain(
    previousStart: Date,
    sessionDurationHours = 5
): BlockMetrics | null | undefined {
    const claudeDir: string | null = getClaudeConfigDir();
    if (!claudeDir)
        return undefined;

    const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
    const now = new Date();
    const previousEndMs = previousStart.getTime() + sessionDurationMs;
    if (previousStart.getTime() > now.getTime() || now.getTime() - previousEndMs > MAX_LOOKBACK_MS)
        return undefined;

    const activity: number[] = [];
    try {
        for (const { file, mtime } of listTranscriptsNewestFirst(claudeDir)) {
            if (mtime.getTime() < previousEndMs) {
                break;
            }

            const reader = new TranscriptActivityReader(file);
            try {
                for (const timestamp of reader.readSince(previousEndMs)) {
                    if (timestamp.getTime() > previousEndMs) {
                        activity.push(timestamp.getTime());
                    }
                }
            } finally {
                reader.close();
            }
        }
    } catch {
        return undefined;
    }

    activity.sort((a, b) => a - b);
    const mostRecent = activity[activity.length - 1];
    if (mostRecent === undefined || now.getTime() - mostRecent > sessionDurationMs)
        return null;

    // The same rule the full scan applies going forward
    let blockStart = previousStart;
    let blockEndMs = previousEndMs;
    for (const timestamp of activity) {
        if (timestamp > blockEndMs) {
            blockStart = floorToHour(new Date(timestamp));
            blockEndMs = blockStart.getTime() + sessionDurationMs;
        }
    }

    if (now.getTime() < blockStart.getTime() || now.getTime() > blockEndMs)
        return null;

    return { startTime: blockStart, lastActivity: new Date(mostRecent) };
}

/**
 * All transcripts under the config directory, most recently modified first
 */
function listTranscriptsNewestFirst(rootDir: string): { file: string; mtime: Date }[] {
    // Keep the pattern relative to cwd: inside a pattern, characters a directory
    // name can contain, such as ( ) [ ] { } * ?, are glob syntax
    const files = globSync(['projects/**/*.jsonl'], {
        absolute: true,  // Ensure we get absolute paths
        cwd: rootDir     // Set working directory to rootDir
    });

    const filesWithStats = files.map((file) => {
        const stats = statSync(file);
        return { file, mtime: stats.mtime };
    });

    filesWithStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return filesWithStats;
}

/**
 * Efficiently finds the most recent 5-hour block start time from JSONL files
 * Uses file modification times as hints to avoid unnecessary reads
 */
function findMostRecentBlockStartTime(
    rootDir: string,
    sessionDurationHours = 5
): BlockMetrics | null {
    // Each transcript is read newest-first and only as far back as the current
    // lookback needs, so the cost tracks recent activity rather than file size.
    // A longer lookback resumes the same read instead of starting over
    const readers = new Map<string, TranscriptActivityReader>();
    try {
        return findBlockStartWithReaders(rootDir, sessionDurationHours, readers);
    } finally {
        for (const reader of readers.values()) {
            reader.close();
        }
    }
}

function findBlockStartWithReaders(
    rootDir: string,
    sessionDurationHours: number,
    readers: Map<string, TranscriptActivityReader>
): BlockMetrics | null {
    const sessionDurationMs = sessionDurationHours * 60 * 60 * 1000;
    const now = new Date();

    // Steps 1 and 2: all JSONL files, most recently modified first
    const filesWithStats = listTranscriptsNewestFirst(rootDir);

    if (filesWithStats.length === 0)
        return null;

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

            let reader = readers.get(file);
            if (!reader) {
                reader = new TranscriptActivityReader(file);
                readers.set(file, reader);
            }

            // One push per timestamp: spreading a long transcript's timestamps
            // into a single call exceeds the engine's argument limit and throws
            for (const timestamp of reader.readSince(cutoffTime.getTime())) {
                timestamps.push(timestamp);
            }
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
        const isLastChunk = lookbackHours === lookbackChunks[lookbackChunks.length - 1];
        continuousWorkStart = mostRecentTimestamp;
        for (let i = 1; i < timestamps.length; i++) {
            const currentTimestamp = timestamps[i];
            const previousTimestamp = timestamps[i - 1];

            if (!currentTimestamp || !previousTimestamp)
                continue;

            const gap = previousTimestamp.getTime() - currentTimestamp.getTime();

            if (gap >= sessionDurationMs) {
                // Transcripts last written before the cutoff weren't read, and
                // their rows could fill the part of this gap before it. Unless the
                // part after the cutoff spans a session by itself, look further back
                foundSessionGap = isLastChunk
                    || previousTimestamp.getTime() - cutoffTime.getTime() >= sessionDurationMs;
                break;
            }

            continuousWorkStart = currentTimestamp;
        }

        // If we found a gap, we're done
        if (foundSessionGap) {
            break;
        }

        // If this was our last chunk, use what we have
        if (isLastChunk) {
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

interface TranscriptRow {
    timestamp?: string;
    isSidechain?: boolean;
    isApiErrorMessage?: boolean;
    message?: { usage?: { input_tokens?: number; output_tokens?: number } };
}

interface ReadRow {
    timestampMs: number;
    activity: Date | null;
}

/**
 * Reads a transcript's block activity newest-first, stopping once it is past
 * the requested cutoff. Calls with an earlier cutoff continue from where the
 * previous call stopped, so no part of the file is read twice
 */
class TranscriptActivityReader {
    private lines: Generator<string> | null;
    private readonly activity: Date[] = [];
    // The row that ended the last read: older than that call's cutoff, but it
    // may still fall inside the next, earlier one
    private heldRow: ReadRow | null = null;

    constructor(filePath: string) {
        try {
            this.lines = iterateJsonlLinesReverseSync(filePath, USAGE_KEY);
        } catch {
            this.lines = null;
        }
    }

    /**
     * Activity timestamps from the end of the file back to the cutoff,
     * newest first. May include a few rows from just before the cutoff, and
     * ends with the row that stopped the read: a gap reaching back past the
     * cutoff only shows up with the row on its far side
     */
    readSince(cutoffMs: number): Date[] {
        this.readBackTo(cutoffMs - READ_PAST_CUTOFF_MS);

        const boundary = this.heldRow?.activity;
        return boundary ? [...this.activity, boundary] : this.activity;
    }

    close(): void {
        // Returning the generator runs its finally block, which closes the file
        this.lines?.return(undefined);
        this.lines = null;
    }

    private readBackTo(stopBeforeMs: number): void {
        if (this.heldRow) {
            if (this.heldRow.timestampMs < stopBeforeMs) {
                return;
            }
            this.keep(this.heldRow);
            this.heldRow = null;
        }

        while (this.lines) {
            let row: ReadRow | null;
            try {
                const next = this.lines.next();
                if (next.done) {
                    this.close();
                    break;
                }
                row = readRow(next.value);
            } catch {
                // Keep what was read before the error, as a forward read would
                this.close();
                break;
            }

            if (!row) {
                continue;
            }

            if (row.timestampMs < stopBeforeMs) {
                this.heldRow = row;
                break;
            }
            this.keep(row);
        }
    }

    private keep(row: ReadRow): void {
        if (row.activity) {
            this.activity.push(row.activity);
        }
    }
}

/**
 * Parses a transcript line far enough to place it in time
 */
function readRow(line: string): ReadRow | null {
    const json = parseJsonlLine(line) as TranscriptRow | null;
    if (!json || typeof json.timestamp !== 'string') {
        return null;
    }

    const timestampMs = Date.parse(json.timestamp);
    if (Number.isNaN(timestampMs)) {
        return null;
    }

    return { timestampMs, activity: getActivityTimestamp(json) };
}

/**
 * Gets when a transcript row was served, or null when the row isn't block activity
 */
function getActivityTimestamp(json: TranscriptRow): Date | null {
    // Only treat entries with real token usage as block activity
    const usage = json.message?.usage;
    if (!usage)
        return null;

    const hasInputTokens = typeof usage.input_tokens === 'number';
    const hasOutputTokens = typeof usage.output_tokens === 'number';
    if (!hasInputTokens || !hasOutputTokens)
        return null;

    if (json.isSidechain === true)
        return null;

    // Claude Code logs a rejected request (a usage limit, an expired
    // login, an outage) as a row with all-zero usage; nothing was served
    if (json.isApiErrorMessage === true)
        return null;

    const timestamp = json.timestamp;
    if (typeof timestamp !== 'string')
        return null;

    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Floors a timestamp to the beginning of the hour (matching existing logic)
 */
function floorToHour(timestamp: Date): Date {
    const floored = new Date(timestamp);
    floored.setUTCMinutes(0, 0, 0);
    return floored;
}
