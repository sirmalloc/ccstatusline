import * as fs from 'node:fs';
import path from 'node:path';

import { capMap } from '../daemon/provider-scope';
import type {
    LastTurnTokens,
    SpeedMetrics,
    TokenMetrics,
    TranscriptLine
} from '../types';
import type { CompactionData } from '../types/RenderContext';

import {
    accumulateCompactionStats,
    createCompactionStats,
    getCompactBoundaryPostTokens,
    isCompactBoundary
} from './compaction';
import {
    contextLengthFromUsageTokens,
    parseUsageTokens,
    type UsageTokens
} from './context-window';
import {
    iterateJsonlLines,
    parseJsonlLine
} from './jsonl-lines';
import {
    getThinkingEffortUpdate,
    type ResolvedThinkingEffort
} from './jsonl-metadata';
import { getSessionNameFromRecord } from './jsonl-session';

export interface SpeedMetricsCollection {
    sessionAverage: SpeedMetrics;
    windowed: Record<string, SpeedMetrics>;
}

export interface TranscriptAnalysisOptions {
    includeSessionDuration?: boolean;
    includeSpeedMetrics?: boolean;
    includeSubagents?: boolean;
    speedWindowSeconds?: number[];
    includeCompactionStats?: boolean;
    includeThinkingEffort?: boolean;
    includeSessionName?: boolean;
    includeLastTurnTokens?: boolean;
}

export interface TranscriptAnalysis {
    tokenMetrics: TokenMetrics;
    sessionDuration: string | null;
    speedMetricsCollection: SpeedMetricsCollection | null;
    compactionData: CompactionData | null;
    thinkingEffort: ResolvedThinkingEffort | undefined;
    sessionName: string | null;
}

interface TranscriptScanOptions extends TranscriptAnalysisOptions { includeTokenMetrics?: boolean }

interface TranscriptScanResult {
    tokenMetrics: TokenMetrics | null;
    sessionDuration: string | null;
    speedMetricsCollection: SpeedMetricsCollection | null;
    compactionData: CompactionData | null;
    thinkingEffort: ResolvedThinkingEffort | undefined;
    sessionName: string | null;
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

interface TokenMetricEntry {
    usage: UsageTokens;
    stopReason: string | null | undefined;
    timestampMs: number | null;
    isMainChain: boolean;
    messageId: string | null;
}

interface TokenMetricAccumulator {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    mostRecentMainChainUsage: UsageTokens | null;
    mostRecentTimestampMs: number | null;
    mostRecentPostCompactionUsage: UsageTokens | null;
    mostRecentPostCompactionTimestampMs: number | null;
}

interface TokenMetricState {
    metrics: TokenMetricAccumulator;
    hasStopReasonField: boolean;
    countedMessageId: string | null;
    countedOutputTokens: number;
    lastUsageEntry: TokenMetricEntry | null;
    sawCompactBoundary: boolean;
    boundaryAfterLastUsage: boolean;
    lastCompactBoundaryPostTokens: number | null;
    lastTurnMessageId: string | null;
    lastTurnTokens: LastTurnTokens | null;
    turnCount: number;
}

function createEmptyTokenMetrics(): TokenMetrics {
    return {
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        totalTokens: 0,
        contextLength: 0
    };
}

function createTokenMetricAccumulator(): TokenMetricAccumulator {
    return {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        mostRecentMainChainUsage: null,
        mostRecentTimestampMs: null,
        mostRecentPostCompactionUsage: null,
        mostRecentPostCompactionTimestampMs: null
    };
}

function resetPostCompactionUsage(accumulator: TokenMetricAccumulator): void {
    accumulator.mostRecentPostCompactionUsage = null;
    accumulator.mostRecentPostCompactionTimestampMs = null;
}

function accumulateTokenMetricEntry(
    accumulator: TokenMetricAccumulator,
    entry: TokenMetricEntry,
    includePostCompactionUsage: boolean
): void {
    const { usage } = entry;
    accumulator.inputTokens += usage.input;
    accumulator.outputTokens += usage.output;
    accumulator.cacheReadTokens += usage.read;
    accumulator.cacheCreationTokens += usage.creation;

    if (!entry.isMainChain || entry.timestampMs === null) {
        return;
    }

    if (accumulator.mostRecentTimestampMs === null || entry.timestampMs > accumulator.mostRecentTimestampMs) {
        accumulator.mostRecentTimestampMs = entry.timestampMs;
        accumulator.mostRecentMainChainUsage = usage;
    }
    if (includePostCompactionUsage
        && (accumulator.mostRecentPostCompactionTimestampMs === null
            || entry.timestampMs > accumulator.mostRecentPostCompactionTimestampMs)) {
        accumulator.mostRecentPostCompactionTimestampMs = entry.timestampMs;
        accumulator.mostRecentPostCompactionUsage = usage;
    }
}

function createTokenMetricState(): TokenMetricState {
    return {
        metrics: createTokenMetricAccumulator(),
        hasStopReasonField: false,
        countedMessageId: null,
        countedOutputTokens: 0,
        lastUsageEntry: null,
        sawCompactBoundary: false,
        boundaryAfterLastUsage: false,
        lastCompactBoundaryPostTokens: null,
        lastTurnMessageId: null,
        lastTurnTokens: null,
        turnCount: 0
    };
}

function createLastTurnTokens(usage: UsageTokens): LastTurnTokens {
    const cachedTokens = usage.read + usage.creation;
    return {
        inputTokens: usage.input,
        outputTokens: usage.output,
        cachedTokens,
        totalTokens: usage.input + usage.output + cachedTokens
    };
}

// Claude Code writes one JSONL entry per content block (thinking / text / each
// tool_use) of a single API call, all sharing one message.id and repeating
// identical prompt-side usage; only output_tokens grows entry to entry.
// Grouping consecutive counted entries by id keeps one usage per call instead
// of one per content block (see sirmalloc/ccstatusline#549). Entries without
// an id each start a new group.
function accumulateCumulativeTokenEntry(
    state: TokenMetricState,
    entry: TokenMetricEntry,
    includePostCompactionUsage: boolean
): void {
    if (state.countedMessageId !== null
        && entry.messageId !== null
        && entry.messageId === state.countedMessageId) {
        // Duplicates only grow output_tokens, so the recency snapshots taken by
        // the group's first counted entry stay valid: per-block entries repeat
        // identical prompt-side usage and contextLength never reads output.
        // Divergent prompt-side usage within one id would need re-snapshotting.
        const outputDelta = entry.usage.output - state.countedOutputTokens;
        if (outputDelta > 0) {
            state.countedOutputTokens = entry.usage.output;
            state.metrics.outputTokens += outputDelta;
        }
        return;
    }

    state.countedMessageId = entry.messageId;
    state.countedOutputTokens = entry.usage.output;
    accumulateTokenMetricEntry(state.metrics, entry, includePostCompactionUsage);
}

function trackLastTurnTokens(state: TokenMetricState, entry: TokenMetricEntry): void {
    const { messageId } = entry;
    if (state.lastTurnTokens !== null
        && messageId !== null
        && messageId === state.lastTurnMessageId) {
        const lastTurn = state.lastTurnTokens;
        lastTurn.outputTokens = Math.max(lastTurn.outputTokens, entry.usage.output);
        lastTurn.totalTokens = lastTurn.inputTokens + lastTurn.outputTokens + lastTurn.cachedTokens;
        return;
    }

    state.lastTurnMessageId = messageId;
    state.lastTurnTokens = createLastTurnTokens(entry.usage);
}

function collectTokenMetricRecord(state: TokenMetricState, data: TranscriptLine | null, timestampMs: number | null): void {
    // A user turn is a real prompt: tool results carry toolUseResult, and
    // meta rows / subagent sidechains / API errors are not the user's turns.
    if (data?.type === 'user' && data.isMeta !== true
        && data.toolUseResult === undefined
        && data.isSidechain !== true && data.isApiErrorMessage !== true) {
        state.turnCount++;
    }

    const compactBoundary = isCompactBoundary(data);
    if (compactBoundary) {
        state.sawCompactBoundary = true;
        state.boundaryAfterLastUsage = true;
        state.lastCompactBoundaryPostTokens = getCompactBoundaryPostTokens(data);
        resetPostCompactionUsage(state.metrics);
    }

    const message = data?.message;
    const usage = message?.usage;
    if (usage) {
        const rawMessageId = message.id;
        const entry: TokenMetricEntry = {
            usage: parseUsageTokens(usage),
            stopReason: message.stop_reason,
            timestampMs,
            isMainChain: data?.isSidechain !== true && !data?.isApiErrorMessage,
            messageId: typeof rawMessageId === 'string' && rawMessageId.length > 0 ? rawMessageId : null
        };

        const hasStopReason = Object.prototype.hasOwnProperty.call(message, 'stop_reason');
        if (hasStopReason && !state.hasStopReasonField) {
            state.hasStopReasonField = true;
            state.metrics = createTokenMetricAccumulator();
            state.countedMessageId = null;
            state.countedOutputTokens = 0;
        }
        if (!state.hasStopReasonField || entry.stopReason) {
            accumulateCumulativeTokenEntry(state, entry, !compactBoundary);
        }
        // Sidechain (subagent) and API-error rows never form the user's turn,
        // matching the recency rule used for context length above.
        if (entry.isMainChain) {
            trackLastTurnTokens(state, entry);
        }
        state.lastUsageEntry = entry;
        state.boundaryAfterLastUsage = compactBoundary;
    }
}

function finishTokenMetrics(state: TokenMetricState, includeLastTurnTokens: boolean): TokenMetrics {
    if (state.hasStopReasonField && state.lastUsageEntry?.stopReason === null) {
        accumulateCumulativeTokenEntry(state, state.lastUsageEntry, !state.boundaryAfterLastUsage);
    }

    const contextLengthFromUsage = (usage: UsageTokens | null): number | null => usage
        ? contextLengthFromUsageTokens(usage)
        : null;
    const contextLength = state.sawCompactBoundary
        ? (contextLengthFromUsage(state.metrics.mostRecentPostCompactionUsage) ?? state.lastCompactBoundaryPostTokens ?? 0)
        : (contextLengthFromUsage(state.metrics.mostRecentMainChainUsage) ?? 0);
    const cachedTokens = state.metrics.cacheReadTokens + state.metrics.cacheCreationTokens;

    return {
        inputTokens: state.metrics.inputTokens,
        outputTokens: state.metrics.outputTokens,
        cachedTokens,
        cacheReadTokens: state.metrics.cacheReadTokens,
        cacheCreationTokens: state.metrics.cacheCreationTokens,
        totalTokens: state.metrics.inputTokens + state.metrics.outputTokens + cachedTokens,
        contextLength,
        lastTurnTokens: includeLastTurnTokens && state.lastTurnTokens
            ? state.lastTurnTokens
            : undefined,
        turnCount: includeLastTurnTokens ? state.turnCount : undefined
    };
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

function parseTimestampMs(value: string | undefined): number | null {
    if (!value) {
        return null;
    }

    const timestampMs = Date.parse(value);
    return Number.isNaN(timestampMs) ? null : timestampMs;
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

interface SpeedMetricCollectorState extends CollectedSpeedMetrics { lastUserTimestampMs: number | null }

function createSpeedMetricCollector(): SpeedMetricCollectorState {
    return {
        requests: [],
        latestTimestampMs: null,
        lastUserTimestampMs: null
    };
}

function collectSpeedMetricRecord(
    state: SpeedMetricCollectorState,
    data: TranscriptLine | null,
    timestampMs: number | null,
    ignoreSidechain: boolean
): void {
    if (!data || data.isApiErrorMessage || (ignoreSidechain && data.isSidechain === true)) {
        return;
    }

    if (timestampMs !== null && (state.latestTimestampMs === null || timestampMs > state.latestTimestampMs)) {
        state.latestTimestampMs = timestampMs;
    }

    if (data.type === 'user' && timestampMs !== null) {
        state.lastUserTimestampMs = timestampMs;
        return;
    }

    if (data.type !== 'assistant' || !data.message?.usage) {
        return;
    }

    let interval: SpeedInterval | null = null;
    if (timestampMs !== null && state.lastUserTimestampMs !== null && timestampMs > state.lastUserTimestampMs) {
        interval = { startMs: state.lastUserTimestampMs, endMs: timestampMs };
    }

    const usage = parseUsageTokens(data.message.usage);
    state.requests.push({
        inputTokens: usage.input,
        outputTokens: usage.output,
        assistantTimestampMs: timestampMs,
        interval
    });
}

async function collectSpeedMetricsFromFile(filePath: string, ignoreSidechain: boolean): Promise<CollectedSpeedMetrics> {
    const state = createSpeedMetricCollector();
    for await (const line of iterateJsonlLines(filePath)) {
        const data = parseJsonlLine(line) as TranscriptLine | null;
        collectSpeedMetricRecord(state, data, parseTimestampMs(data?.timestamp), ignoreSidechain);
    }

    return state;
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

function buildSpeedMetricsCollection(collected: CollectedSpeedMetrics[], windowSeconds: number[]): SpeedMetricsCollection {
    const combined = mergeCollectedSpeedMetrics(collected);
    const windowed: Record<string, SpeedMetrics> = {};
    for (const window of windowSeconds) {
        windowed[window.toString()] = buildSpeedMetrics(combined, window);
    }

    return {
        sessionAverage: buildSpeedMetrics(combined),
        windowed
    };
}

function formatSessionDuration(firstTimestampMs: number | null, lastTimestampMs: number | null): string | null {
    if (firstTimestampMs === null || lastTimestampMs === null) {
        return null;
    }

    const totalMinutes = Math.floor((lastTimestampMs - firstTimestampMs) / (1000 * 60));
    if (totalMinutes < 1) {
        return '<1m';
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) {
        return `${minutes}m`;
    }
    if (minutes === 0) {
        return `${hours}hr`;
    }
    return `${hours}hr ${minutes}m`;
}

function normalizeSpeedWindows(windowSeconds: number[] | undefined): number[] {
    return Array.from(
        new Set(
            (windowSeconds ?? [])
                .map(window => normalizeWindowSeconds(window))
                .filter((window): window is number => window !== null)
        )
    );
}

function createEmptyScanResult(options: TranscriptScanOptions, speedWindows: number[]): TranscriptScanResult {
    return {
        tokenMetrics: options.includeTokenMetrics ? createEmptyTokenMetrics() : null,
        sessionDuration: null,
        speedMetricsCollection: options.includeSpeedMetrics
            ? {
                sessionAverage: createEmptySpeedMetrics(),
                windowed: buildEmptyWindowedMetrics(speedWindows)
            }
            : null,
        compactionData: options.includeCompactionStats ? createCompactionStats() : null,
        thinkingEffort: undefined,
        sessionName: null
    };
}

async function scanTranscript(transcriptPath: string, options: TranscriptScanOptions): Promise<TranscriptScanResult> {
    const speedWindows = normalizeSpeedWindows(options.speedWindowSeconds);
    const emptyResult = createEmptyScanResult(options, speedWindows);
    if (!fs.existsSync(transcriptPath)) {
        return emptyResult;
    }

    const tokenState = options.includeTokenMetrics ? createTokenMetricState() : null;
    const speedState = options.includeSpeedMetrics ? createSpeedMetricCollector() : null;
    const compactionData = options.includeCompactionStats ? createCompactionStats() : null;
    const referencedAgentIds = options.includeSpeedMetrics && options.includeSubagents
        ? new Set<string>()
        : null;
    let firstTimestampMs: number | null = null;
    let lastTimestampMs: number | null = null;
    let thinkingEffort: ResolvedThinkingEffort | undefined;
    let sessionName: string | null = null;

    try {
        for await (const line of iterateJsonlLines(transcriptPath)) {
            const data = parseJsonlLine(line) as TranscriptLine | null;
            const needsTimestamp = options.includeSessionDuration === true
                || speedState !== null
                || Boolean(data?.message?.usage);
            const timestampMs = needsTimestamp ? parseTimestampMs(data?.timestamp) : null;

            if (tokenState) {
                collectTokenMetricRecord(tokenState, data, timestampMs);
            }
            if (options.includeSessionDuration && timestampMs !== null) {
                firstTimestampMs ??= timestampMs;
                lastTimestampMs = timestampMs;
            }
            if (speedState) {
                collectSpeedMetricRecord(speedState, data, timestampMs, true);
            }
            if (referencedAgentIds) {
                collectAgentIds(data, referencedAgentIds);
            }
            if (compactionData) {
                accumulateCompactionStats(compactionData, data);
            }
            if (options.includeThinkingEffort) {
                const update = getThinkingEffortUpdate(data);
                if (update) {
                    thinkingEffort = update.effort;
                }
            }
            if (options.includeSessionName) {
                sessionName = getSessionNameFromRecord(data) ?? sessionName;
            }
        }

        let speedMetricsCollection: SpeedMetricsCollection | null = null;
        if (speedState) {
            const collected: CollectedSpeedMetrics[] = [speedState];
            if (referencedAgentIds) {
                const subagentPaths = getSubagentTranscriptPaths(transcriptPath, referencedAgentIds);
                const subagentMetrics = await Promise.all(subagentPaths.map(async (subagentPath) => {
                    try {
                        return await collectSpeedMetricsFromFile(subagentPath, false);
                    } catch {
                        return null;
                    }
                }));
                for (const metrics of subagentMetrics) {
                    if (metrics) {
                        collected.push(metrics);
                    }
                }
            }
            speedMetricsCollection = buildSpeedMetricsCollection(collected, speedWindows);
        }

        return {
            tokenMetrics: tokenState ? finishTokenMetrics(tokenState, options.includeLastTurnTokens === true) : null,
            sessionDuration: options.includeSessionDuration
                ? formatSessionDuration(firstTimestampMs, lastTimestampMs)
                : null,
            speedMetricsCollection,
            compactionData,
            thinkingEffort,
            sessionName
        };
    } catch {
        return emptyResult;
    }
}

function getSubagentTranscriptPaths(transcriptPath: string, referencedAgentIds: Set<string>): string[] {
    return listSubagentTranscriptPaths(transcriptPath).filter((fullPath) => {
        const match = /[/\\]agent-(.+)\.jsonl$/.exec(fullPath);
        return match?.[1] !== undefined && referencedAgentIds.has(match[1]);
    });
}

/** Every subagent transcript file next to the main transcript (any agent id). */
function listSubagentTranscriptPaths(transcriptPath: string): string[] {
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

                if (!/^agent-.+\.jsonl$/.test(entry.name)) {
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

export async function getTranscriptAnalysis(
    transcriptPath: string,
    options: TranscriptAnalysisOptions = {}
): Promise<TranscriptAnalysis> {
    const optionsKey = getAnalysisOptionsKey(options);
    const cached = await revalidateTranscriptAnalysisCache(transcriptPath, optionsKey);
    if (cached) {
        return cached;
    }

    const dedupKey = `${transcriptPath}\0${optionsKey}`;
    const inFlight = analysisInFlight.get(dedupKey);
    if (inFlight) {
        return inFlight;
    }

    const promise = scanAndCacheTranscriptAnalysis(transcriptPath, options, optionsKey);
    analysisInFlight.set(dedupKey, promise);
    try {
        return await promise;
    } finally {
        analysisInFlight.delete(dedupKey);
    }
}

// --- Whole-analysis reuse (#18) -------------------------------------------------
//
// The daemon repaints the same transcript many times per minute; the analysis
// is a full read of the file (plus subagent files), so unchanged files are
// reused wholesale. Reuse is validated by file identity — device, inode, size
// and mtime — captured AFTER the scan that produced the analysis: an append
// (growth), a truncation, a replacement (new inode) or a compaction rewrite
// all change at least one component, so every such request rescans. In-flight
// scans for the same (path, options) dedup into one scan. Incremental tail
// parsing stays out of scope (conditional follow-up in #18).

interface TranscriptFileIdentity {
    dev: number;
    ino: number;
    size: number;
    mtimeMs: number;
}

interface TranscriptAnalysisCacheEntry {
    optionsKey: string;
    identity: TranscriptFileIdentity;
    subagents: { path: string; identity: TranscriptFileIdentity }[];
    analysis: TranscriptAnalysis;
    createdAt: number;
}

const TRANSCRIPT_ANALYSIS_CACHE_MAX_ENTRIES = 16;
const analysisCache = new Map<string, TranscriptAnalysisCacheEntry>();
const analysisInFlight = new Map<string, Promise<TranscriptAnalysis>>();

function getAnalysisOptionsKey(options: TranscriptAnalysisOptions): string {
    const keys = Object.keys(options).sort() as (keyof TranscriptAnalysisOptions)[];
    return JSON.stringify(Object.fromEntries(keys.map(key => [key, options[key]])));
}

function getTranscriptFileIdentity(stats: fs.Stats): TranscriptFileIdentity {
    return { dev: stats.dev, ino: stats.ino, size: stats.size, mtimeMs: stats.mtimeMs };
}

function transcriptIdentityMatches(identity: TranscriptFileIdentity, stats: fs.Stats): boolean {
    return identity.dev === stats.dev
        && identity.ino === stats.ino
        && identity.size === stats.size
        && identity.mtimeMs === stats.mtimeMs;
}

async function statOrNull(filePath: string): Promise<fs.Stats | null> {
    try {
        return await fs.promises.stat(filePath);
    } catch {
        return null;
    }
}

async function revalidateTranscriptAnalysisCache(transcriptPath: string, optionsKey: string): Promise<TranscriptAnalysis | null> {
    const entry = analysisCache.get(transcriptPath);
    if (entry?.optionsKey !== optionsKey) {
        return null;
    }

    const stats = await statOrNull(transcriptPath);
    if (!stats || !transcriptIdentityMatches(entry.identity, stats)) {
        analysisCache.delete(transcriptPath);
        return null;
    }

    for (const subagent of entry.subagents) {
        const subStats = await statOrNull(subagent.path);
        if (!subStats || !transcriptIdentityMatches(subagent.identity, subStats)) {
            analysisCache.delete(transcriptPath);
            return null;
        }
    }

    // A newly appeared subagent file means new data the stored identity list
    // cannot see (a fresh agent id only ever arrives together with main-file
    // rows, but the listing check makes that assumption explicit).
    const listed = listSubagentTranscriptPaths(transcriptPath);
    if (listed.length !== entry.subagents.length) {
        analysisCache.delete(transcriptPath);
        return null;
    }

    // Refresh recency for FIFO eviction without disturbing Map key order.
    analysisCache.delete(transcriptPath);
    entry.createdAt = Date.now();
    analysisCache.set(transcriptPath, entry);
    return entry.analysis;
}

async function scanAndCacheTranscriptAnalysis(
    transcriptPath: string,
    options: TranscriptAnalysisOptions,
    optionsKey: string
): Promise<TranscriptAnalysis> {
    const result = await scanTranscript(transcriptPath, {
        ...options,
        includeTokenMetrics: true
    });

    const analysis: TranscriptAnalysis = {
        tokenMetrics: result.tokenMetrics ?? createEmptyTokenMetrics(),
        sessionDuration: result.sessionDuration,
        speedMetricsCollection: result.speedMetricsCollection,
        compactionData: result.compactionData,
        thinkingEffort: result.thinkingEffort,
        sessionName: result.sessionName
    };

    // Identity is captured after the scan: it describes the file as the
    // analysis saw it (as closely as stat can), so anything written during or
    // after the scan invalidates the entry on the next validation.
    const stats = await statOrNull(transcriptPath);
    if (stats) {
        const subagents: TranscriptAnalysisCacheEntry['subagents'] = [];
        for (const subagentPath of listSubagentTranscriptPaths(transcriptPath)) {
            const subStats = await statOrNull(subagentPath);
            if (subStats) {
                subagents.push({ path: subagentPath, identity: getTranscriptFileIdentity(subStats) });
            }
        }
        analysisCache.set(transcriptPath, {
            optionsKey,
            identity: getTranscriptFileIdentity(stats),
            subagents,
            analysis,
            createdAt: Date.now()
        });
        capMap(analysisCache, TRANSCRIPT_ANALYSIS_CACHE_MAX_ENTRIES);
    }

    return analysis;
}

/** Test seam: drop every cached transcript analysis. */
export function clearTranscriptAnalysisCache(): void {
    analysisCache.clear();
    analysisInFlight.clear();
}
