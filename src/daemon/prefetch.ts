import type { RenderPrefetch } from '../render';
import type { BlockMetrics } from '../types';
import type { RenderContext } from '../types/RenderContext';
import type { Settings } from '../types/Settings';
import type { StatusJSON } from '../types/StatusJSON';
import type { WidgetItem } from '../types/Widget';
import { prefetchClaudeStatusIfNeeded } from '../utils/claude-service-status';
import { getClaudeConfigDir } from '../utils/claude-settings';
import {
    buildCustomCommandRequest,
    runCustomCommandAsync
} from '../utils/custom-command';
import {
    getExecutedGitCommands,
    resolveGitCwd,
    runGitArgsAsync
} from '../utils/git';
import { fetchGitReviewDataAsync } from '../utils/git-review-cache';
import {
    getExecutedJjCommands,
    runJjArgsAsync
} from '../utils/jj';
import { getCachedBlockMetricsAsync } from '../utils/jsonl-cache';
import { getTranscriptAnalysis } from '../utils/jsonl-metrics';
import {
    getWidgetSpeedWindowSeconds,
    isWidgetSpeedWindowEnabled
} from '../utils/speed-window';
import type { UsageMemoryCache } from '../utils/usage-fetch';
import {
    getUsageCredentialsAsync,
    getUsageScopeKey
} from '../utils/usage-fetch';
import {
    hasUsageDependentWidgets,
    prefetchUsageDataIfNeeded
} from '../utils/usage-prefetch';

import {
    RefreshGroup,
    capMap
} from './provider-scope';

// Daemon render prefetch (#18): everything below runs before the synchronous
// formatting section, off the render loop, deduped through one RefreshGroup so
// concurrent sessions that need the same git command / usage account / review
// lookup share a single execution, and released as soon as the requesting
// render goes away. Widget output never changes: prefetch warms exactly the
// caches and computes exactly the values the sync formatter reads.

/** Per-daemon state shared across requests. */
export interface PrefetchState {
    refresh: RefreshGroup;
    /** One usage memory cache per credential fingerprint (account scope). */
    usageCaches: Map<string, UsageMemoryCache>;
}

export function createPrefetchState(): PrefetchState {
    return {
        refresh: new RefreshGroup(),
        usageCaches: new Map<string, UsageMemoryCache>()
    };
}

export interface PrefetchRequestScope {
    /** Merged request environment (daemon env + allowlisted request values). */
    env: NodeJS.ProcessEnv;
    /** Absolute request working directory. */
    cwd: string;
    /** Terminal width resolved for this request (feeds custom command input). */
    terminalWidth: number | null;
    signal: AbortSignal;
    state: PrefetchState;
}

const USAGE_CACHES_MAX_ENTRIES = 8;

// git commands each widget family runs, keyed by widget type. Every git widget
// also runs the work-tree check. ponytail: this table must list new git widget
// commands or their first render per repo pays one sync spawn; the executed-
// command log (recorded on every sync run) covers everything after that.
const GIT_PREFETCH_COMMANDS: Record<string, string[]> = {
    'git-branch': ['symbolic-ref --short HEAD'],
    'git-root-dir': ['rev-parse --show-toplevel'],
    'git-worktree': ['rev-parse --git-dir'],
    'git-changes': ['diff --shortstat', 'diff --cached --shortstat'],
    'git-insertions': ['diff --shortstat', 'diff --cached --shortstat'],
    'git-deletions': ['diff --shortstat', 'diff --cached --shortstat'],
    'git-status': ['status --porcelain -z'],
    'git-staged': ['status --porcelain -z'],
    'git-unstaged': ['status --porcelain -z'],
    'git-untracked': ['status --porcelain -z'],
    'git-clean-status': ['status --porcelain -z'],
    'git-staged-files': ['status --porcelain -z'],
    'git-unstaged-files': ['status --porcelain -z'],
    'git-untracked-files': ['status --porcelain -z'],
    'git-ahead-behind': ['rev-list --left-right --count HEAD...@{upstream}'],
    'git-conflicts': ['ls-files --unmerged'],
    'git-sha': ['rev-parse --short HEAD'],
    'git-is-fork': ['remote', 'remote get-url -- origin'],
    'git-origin-owner': ['remote', 'remote get-url -- origin'],
    'git-origin-repo': ['remote', 'remote get-url -- origin'],
    'git-origin-owner-repo': ['remote', 'remote get-url -- origin'],
    'git-upstream-owner': ['remote', 'remote get-url -- upstream', 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}'],
    'git-upstream-repo': ['remote', 'remote get-url -- upstream', 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}'],
    'git-upstream-owner-repo': ['remote', 'remote get-url -- upstream', 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}']
};

const GIT_BASE_COMMAND = 'rev-parse --is-inside-work-tree';
const JJ_BASE_COMMAND = 'root';

function collectGitCommandTokens(lineItems: WidgetItem[]): Set<string> {
    const tokens = new Set<string>();
    for (const item of lineItems) {
        if (!item.type.startsWith('git-')) {
            continue;
        }
        tokens.add(GIT_BASE_COMMAND);
        for (const command of GIT_PREFETCH_COMMANDS[item.type] ?? []) {
            tokens.add(command);
        }
    }
    return tokens;
}

function hasGitReviewWidgets(lineItems: WidgetItem[][]): boolean {
    return lineItems.some(line => line.some(item => item.type === 'git-pr' || item.type === 'git-ci-status'));
}

function hasBlockTimerWidgets(lineItems: WidgetItem[][]): boolean {
    return lineItems.some(line => line.some(item => item.type === 'block-timer' || item.type === 'block-reset-timer'));
}

/**
 * Mirror of the transcript options renderStatusLines computes for itself. Must
 * stay in sync with render.ts — the analysis cache keys on these options, so a
 * drift means two different option sets thrash one cache entry per path.
 */
function transcriptOptionsFor(data: StatusJSON, settings: Settings): Parameters<typeof getTranscriptAnalysis>[1] {
    const lines = settings.lines;
    const speedWidgetTypes = new Set(['output-speed', 'input-speed', 'total-speed']);
    const hasSessionClock = lines.some(line => line.some(item => item.type === 'session-clock'));
    const hasSpeedItems = lines.some(line => line.some(item => speedWidgetTypes.has(item.type)));
    const hasCompactionWidget = lines.some(line => line.some(item => item.type === 'compaction-counter'));
    const hasThinkingEffortWidget = lines.some(line => line.some(item => item.type === 'thinking-effort'));
    const hasSessionNameWidget = lines.some(line => line.some(item => item.type === 'session-name'));
    const hasLastTurnTokensWidget = lines.some(line => line.some(item => item.type === 'tokens-last-turn'));
    const needsTranscriptThinkingEffort = hasThinkingEffortWidget
        && (!data.effort || !('level' in data.effort));
    const hasSessionDurationInStatusJson = typeof data.cost?.total_duration_ms === 'number'
        && Number.isFinite(data.cost.total_duration_ms) && data.cost.total_duration_ms >= 0;
    const requestedSpeedWindows = new Set<number>();
    for (const line of lines) {
        for (const item of line) {
            if (speedWidgetTypes.has(item.type) && isWidgetSpeedWindowEnabled(item)) {
                requestedSpeedWindows.add(getWidgetSpeedWindowSeconds(item));
            }
        }
    }

    return {
        includeSessionDuration: hasSessionClock && !hasSessionDurationInStatusJson,
        includeSpeedMetrics: hasSpeedItems,
        includeSubagents: true,
        speedWindowSeconds: Array.from(requestedSpeedWindows),
        includeCompactionStats: hasCompactionWidget,
        includeThinkingEffort: needsTranscriptThinkingEffort,
        includeSessionName: hasSessionNameWidget,
        includeLastTurnTokens: hasLastTurnTokensWidget
    };
}

/**
 * Build the minimal render context the provider twins resolve cwd/env from.
 * resolveGitCwd reads data.cwd/workspace; the request cwd is the same fallback
 * the widgets see (context.cwd).
 */
function prefetchRenderContext(scope: PrefetchRequestScope, data: StatusJSON, settings: Settings): RenderContext {
    return {
        data,
        env: scope.env,
        cwd: scope.cwd,
        terminalWidth: scope.terminalWidth,
        gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
        customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds
    };
}

/** Track one shared refresh for this request: aborting the request releases it. */
function trackRefresh<T>(
    scope: PrefetchRequestScope,
    key: string,
    work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
    const { promise, release } = scope.state.refresh.refresh(key, work);
    if (scope.signal.aborted) {
        release();
        return promise;
    }
    scope.signal.addEventListener('abort', release, { once: true });
    return promise;
}

async function prefetchGitCommands(
    lineItems: WidgetItem[][],
    scope: PrefetchRequestScope,
    data: StatusJSON,
    settings: Settings
): Promise<void> {
    const gitContext: RenderContext = prefetchRenderContext(scope, data, settings);
    const gitCwd = resolveGitCwd(gitContext) ?? scope.cwd;

    const tokens = collectGitCommandTokens(lineItems.flat());
    for (const args of getExecutedGitCommands(gitCwd)) {
        tokens.add(args.join(' '));
    }
    for (const token of tokens) {
        const args = token.split(/\s+/).filter(Boolean);
        if (args.length === 0) {
            continue;
        }
        // ponytail: the git twins enforce their own 5s timeout, so the group
        // signal is not wired into the spawn here; cancellation bounds joins,
        // not local git. Wire execFile's signal through if that ever matters.
        await trackRefresh(scope, `git:${gitCwd}\0${token}`, () => runGitArgsAsync(args, gitContext, token))
            .catch(() => undefined);
    }

    if (lineItems.some(line => line.some(item => item.type.startsWith('jj-')))) {
        const jjTokens = new Set<string>([JJ_BASE_COMMAND]);
        for (const args of getExecutedJjCommands(gitCwd)) {
            jjTokens.add(args.join('\0'));
        }
        for (const token of jjTokens) {
            const args = token === JJ_BASE_COMMAND ? [JJ_BASE_COMMAND] : token.split('\0');
            await trackRefresh(scope, `jj:${gitCwd}\0${token}`, () => runJjArgsAsync(args, gitContext))
                .catch(() => undefined);
        }
    }
}

async function prefetchGitReview(
    lineItems: WidgetItem[][],
    scope: PrefetchRequestScope,
    data: StatusJSON,
    settings: Settings
): Promise<void> {
    if (!hasGitReviewWidgets(lineItems)) {
        return;
    }
    const gitContext: RenderContext = prefetchRenderContext(scope, data, settings);
    const gitCwd = resolveGitCwd(gitContext) ?? scope.cwd;
    const includeChecks = lineItems.some(line => line.some(item => item.type === 'git-ci-status'));

    await trackRefresh(
        scope,
        `git-review:${gitCwd}\0${includeChecks ? 'checks' : 'metadata'}`,
        signal => fetchGitReviewDataAsync(gitCwd, { includeChecks, env: scope.env }, signal)
    ).catch(() => undefined);
}

async function prefetchCustomCommands(
    lineItems: WidgetItem[][],
    scope: PrefetchRequestScope,
    data: StatusJSON,
    settings: Settings
): Promise<void> {
    const context: RenderContext = prefetchRenderContext(scope, data, settings);
    for (const item of lineItems.flat()) {
        if (item.type !== 'custom-command') {
            continue;
        }
        const request = buildCustomCommandRequest(item, context);
        if (request === null) {
            continue;
        }
        const key = `custom:${request.cwd ?? scope.cwd}\0${request.command}\0${request.sessionId ?? ''}\0${request.terminalWidth ?? ''}`;
        await trackRefresh(scope, key, signal => runCustomCommandAsync(request, signal))
            .catch(() => undefined);
    }
}

async function prefetchUsage(
    lineItems: WidgetItem[][],
    scope: PrefetchRequestScope,
    data: StatusJSON
): Promise<Awaited<ReturnType<typeof prefetchUsageDataIfNeeded>>> {
    if (!hasUsageDependentWidgets(lineItems)) {
        return null;
    }

    // Account scope before anything else (#18): credentials resolved once per
    // render (deduped), and the memory cache picked by credential fingerprint
    // so no fast return can cross accounts. The dedup key carries the env
    // inputs of credential resolution (absent-vs-empty preserved) so two
    // profiles cannot join one resolution (#18 review).
    const credentialsKey = `usage-credentials:${JSON.stringify([
        scope.env.CLAUDE_CONFIG_DIR,
        scope.env.CLAUDE_SECURESTORAGE_CONFIG_DIR
    ])}`;
    const credentials = await trackRefresh(
        scope,
        credentialsKey,
        signal => getUsageCredentialsAsync(scope.env, signal)
    );
    const scopeKey = credentials ? getUsageScopeKey(credentials) : 'none';
    let cache = scope.state.usageCaches.get(scopeKey);
    if (!cache) {
        cache = { data: null, time: 0, errorMaxAge: 30 };
        scope.state.usageCaches.set(scopeKey, cache);
        capMap(scope.state.usageCaches, USAGE_CACHES_MAX_ENTRIES);
    }

    return trackRefresh(scope, `usage:${scopeKey}`, (groupSignal) => {
        return prefetchUsageDataIfNeeded(lineItems, data, {
            cache: cache,
            credentials,
            signal: groupSignal,
            env: scope.env
        });
    });
}

/**
 * Gather everything the render needs before the synchronous formatting
 * section (#18). Individual prefetch failures never fail the render: the
 * formatter falls back to computing (or the cached fallback) exactly as the
 * one-shot path does.
 */
export async function prefetchRenderData(
    data: StatusJSON,
    settings: Settings,
    scope: PrefetchRequestScope
): Promise<RenderPrefetch> {
    const lineItems = settings.lines;

    const transcriptAnalysis: Promise<RenderPrefetch['transcriptAnalysis']> = data.transcript_path
        ? getTranscriptAnalysis(data.transcript_path, transcriptOptionsFor(data, settings))
            .catch(() => null)
        : Promise.resolve(null);

    const usageData = prefetchUsage(lineItems, scope, data).catch(() => null);

    const claudeStatusData = trackRefresh(
        scope,
        'claude-status',
        signal => prefetchClaudeStatusIfNeeded(lineItems, { signal, env: scope.env })
    ).catch(() => null);

    // Warm-ups land in shared provider caches the sync section reads.
    const warmups = [
        prefetchGitCommands(lineItems, scope, data, settings),
        prefetchGitReview(lineItems, scope, data, settings),
        prefetchCustomCommands(lineItems, scope, data, settings)
    ];

    const blockMetrics: Promise<BlockMetrics | null | undefined> = hasBlockTimerWidgets(lineItems)
        ? trackRefresh(scope, `block:${getClaudeConfigDir(scope.env)}`, () => getCachedBlockMetricsAsync(scope.env))
            .catch(() => undefined)
        : Promise.resolve(undefined);

    const [transcript, usage, claudeStatus, block] = await Promise.all([
        transcriptAnalysis,
        usageData,
        claudeStatusData,
        blockMetrics
    ]);
    await Promise.all(warmups);

    return {
        transcriptAnalysis: transcript,
        usageData: usage,
        claudeStatusData: claudeStatus,
        ...(block !== undefined ? { blockMetrics: block } : {})
    };
}
