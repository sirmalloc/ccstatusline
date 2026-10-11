import chalk from 'chalk';

import type {
    BlockMetrics,
    SkillsMetrics
} from './types';
import type {
    ClaudeStatusRenderData,
    RenderContext,
    RenderInvocation
} from './types/RenderContext';
import type { Settings } from './types/Settings';
import type { StatusJSON } from './types/StatusJSON';
import { getVisibleText } from './utils/ansi';
import { prefetchClaudeStatusIfNeeded } from './utils/claude-service-status';
import { updateColorMap } from './utils/colors';
import { ZERO_COMPACTION_STATS } from './utils/compaction';
import type { LoadedSettings } from './utils/config';
import { saveSettingsTo } from './utils/config';
import type { TranscriptAnalysis } from './utils/jsonl';
import { getTranscriptAnalysis } from './utils/jsonl';
import {
    advanceGlobalPowerlineThemeIndex,
    hasOwnLineTheme
} from './utils/powerline-theme-index';
import {
    buildConfigWarningBadge,
    calculateMaxWidthsFromPreRendered,
    countPowerlineStartCapSlots,
    preRenderAllWidgets,
    renderStatusLine
} from './utils/renderer';
import { advanceGlobalSeparatorIndex } from './utils/separator-index';
import { getSkillsMetrics } from './utils/skills';
import {
    getWidgetSpeedWindowSeconds,
    isWidgetSpeedWindowEnabled
} from './utils/speed-window';
import { sanitizeTerminalText } from './utils/terminal-sanitize';
import { prefetchUsageDataIfNeeded } from './utils/usage-prefetch';

export interface RenderedStatusLines {
    /** All output lines joined with '\n', without a trailing newline; '' if nothing to print. */
    text: string;
    settings: Settings;
    loadError: string | null;
}

/**
 * Provider data gathered before the render (#18). The shared daemon prefetches
 * all of it concurrently (deduped per account/repo key, cancellable) and hands
 * the bundle in; one-shot and serve mode leave it unset and the render
 * computes each piece itself, exactly as before. A field left `undefined`
 * means "not prefetched — compute here"; an explicit null is a computed empty
 * result and suppresses the fallback (e.g. the block-metrics directory walk).
 */
export interface RenderPrefetch {
    transcriptAnalysis?: TranscriptAnalysis | null;
    usageData?: Awaited<ReturnType<typeof prefetchUsageDataIfNeeded>>;
    claudeStatusData?: ClaudeStatusRenderData | null;
    blockMetrics?: BlockMetrics | null;
}

function hasSessionDurationInStatusJson(data: StatusJSON): boolean {
    const durationMs = data.cost?.total_duration_ms;
    return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0;
}

/**
 * Request-scoped render orchestration (#15): given validated input, the
 * config loaded for this request, and an explicit invocation snapshot, returns
 * the status line text. No stdout, no process exit, no process-global reads —
 * the entry point owns those.
 *
 * The section after the last await (chalk setup through pre-render and line
 * formatting) is fully synchronous, so per-request styling state — the one
 * remaining process-global (chalk.level/COLOR_MAP) — is serialized there and
 * cannot interleave with a concurrent request.
 */
export async function renderStatusLines(
    data: StatusJSON,
    loaded: LoadedSettings,
    invocation: RenderInvocation,
    prefetch: RenderPrefetch = {}
): Promise<RenderedStatusLines> {
    const { settings, loadError: configError } = loaded;

    // Get all lines to render
    const lines = settings.lines;

    // Check if session clock is needed
    const hasSessionClock = lines.some(line => line.some(item => item.type === 'session-clock'));

    const speedWidgetTypes = new Set(['output-speed', 'input-speed', 'total-speed']);
    const hasSpeedItems = lines.some(line => line.some(item => speedWidgetTypes.has(item.type)));
    const hasCompactionWidget = lines.some(line => line.some(item => item.type === 'compaction-counter'));
    const hasThinkingEffortWidget = lines.some(line => line.some(item => item.type === 'thinking-effort'));
    const hasSessionNameWidget = lines.some(line => line.some(item => item.type === 'session-name'));
    const hasLastTurnTokensWidget = lines.some(line => line.some(item => item.type === 'tokens-last-turn'));
    const needsTranscriptThinkingEffort = hasThinkingEffortWidget
        && (!data.effort || !('level' in data.effort));
    const requestedSpeedWindows = new Set<number>();
    for (const line of lines) {
        for (const item of line) {
            if (speedWidgetTypes.has(item.type) && isWidgetSpeedWindowEnabled(item)) {
                requestedSpeedWindows.add(getWidgetSpeedWindowSeconds(item));
            }
        }
    }

    const transcriptAnalysisPromise = prefetch.transcriptAnalysis !== undefined
        ? Promise.resolve(prefetch.transcriptAnalysis)
        : data.transcript_path
            ? getTranscriptAnalysis(data.transcript_path, {
                includeSessionDuration: hasSessionClock && !hasSessionDurationInStatusJson(data),
                includeSpeedMetrics: hasSpeedItems,
                includeSubagents: true,
                speedWindowSeconds: Array.from(requestedSpeedWindows),
                includeCompactionStats: hasCompactionWidget,
                includeThinkingEffort: needsTranscriptThinkingEffort,
                includeSessionName: hasSessionNameWidget,
                includeLastTurnTokens: hasLastTurnTokensWidget
            })
            : Promise.resolve(null);
    const [transcriptAnalysis, usageData, claudeStatusData] = await Promise.all([
        transcriptAnalysisPromise,
        prefetch.usageData !== undefined
            ? Promise.resolve(prefetch.usageData)
            : prefetchUsageDataIfNeeded(lines, data),
        prefetch.claudeStatusData !== undefined
            ? Promise.resolve(prefetch.claudeStatusData)
            : prefetchClaudeStatusIfNeeded(lines)
    ]);

    // --- Start of the synchronous formatting section (chalk setup through
    // pre-render and line formatting; the only awaits below it are the
    // updatemessage config writes after formatting is done). ---
    // Set global chalk level based on settings, then rebuild the color map.
    // Kept at the top of the sync section (rather than before the awaits) so
    // concurrent requests (#15) serialize on styling state for the whole
    // formatting pass.
    chalk.level = settings.colorLevel;
    updateColorMap();

    const tokenMetrics = transcriptAnalysis?.tokenMetrics ?? null;
    const sessionDuration = transcriptAnalysis?.sessionDuration ?? null;
    const speedMetrics = transcriptAnalysis?.speedMetricsCollection?.sessionAverage ?? null;
    const windowedSpeedMetrics = transcriptAnalysis?.speedMetricsCollection?.windowed ?? null;

    let skillsMetrics: SkillsMetrics | null = null;
    if (data.session_id) {
        skillsMetrics = getSkillsMetrics(data.session_id);
    }

    const compactionData = hasCompactionWidget
        ? (transcriptAnalysis?.compactionData ?? ZERO_COMPACTION_STATS)
        : null;

    // Create render context
    const context: RenderContext = {
        data,
        tokenMetrics,
        speedMetrics,
        windowedSpeedMetrics,
        usageData,
        claudeStatusData,
        sessionDuration,
        transcriptSessionName: hasSessionNameWidget
            ? (transcriptAnalysis?.sessionName ?? null)
            : undefined,
        transcriptThinkingEffort: needsTranscriptThinkingEffort
            ? (transcriptAnalysis?.thinkingEffort ?? null)
            : undefined,
        skillsMetrics,
        compactionData,
        terminalWidth: invocation.terminalWidth,
        isPreview: false,
        minimalist: settings.minimalistMode,
        gitCacheTtlSeconds: settings.gitCacheTtlSeconds,
        customCommandCacheTtlSeconds: settings.customCommandCacheTtlSeconds,
        gitReviewNeedsChecks: lines.some(line => line.some(item => item.type === 'git-ci-status')),
        // Request env/cwd snapshots (#18): provider calls in the formatting
        // section resolve through these instead of process state, so the
        // daemon never swaps process.env/cwd between concurrent renders.
        env: invocation.env,
        cwd: invocation.cwd,
        // Only meaningful when the daemon prefetch computed it: undefined
        // (one-shot) lets usage widgets run the directory walk themselves,
        // an explicit null suppresses it.
        ...(prefetch.blockMetrics !== undefined ? { blockMetrics: prefetch.blockMetrics } : {})
    };

    const outputLines: string[] = [];

    // Always pre-render all widgets once (for efficiency)
    const preRenderedLines = preRenderAllWidgets(lines, settings, context);
    const preCalculatedMaxWidths = calculateMaxWidthsFromPreRendered(preRenderedLines, settings);

    // Render each line using pre-rendered content
    let globalSeparatorIndex = 0;
    let globalPowerlineThemeIndex = 0;
    let globalPowerlineStartCapIndex = 0;
    let configBadgePrepended = false;
    for (let i = 0; i < lines.length; i++) {
        const lineItems = lines[i];
        if (lineItems && lineItems.length > 0) {
            const preRenderedWidgets = preRenderedLines[i] ?? [];
            const lineContext = {
                ...context,
                lineIndex: i,
                globalSeparatorIndex,
                globalPowerlineThemeIndex,
                globalPowerlineStartCapIndex
            };
            let line = renderStatusLine(lineItems, settings, lineContext, preRenderedWidgets, preCalculatedMaxWidths);

            // Only output the line if it has content (not just ANSI codes)
            // Strip ANSI codes to check if there's actual text
            const strippedLine = getVisibleText(line).trim();
            if (strippedLine.length > 0) {
                if (configError && !configBadgePrepended) {
                    // On the error path settings are always inMemoryDefaults(), whose separators render as ' | '.
                    line = `${buildConfigWarningBadge(settings.colorLevel)} | ${line}`;
                    configBadgePrepended = true;
                }

                // Sanitize, then replace all spaces with non-breaking spaces to
                // prevent VSCode trimming. The renderer's own output is colors
                // and links; this is the last stop before the terminal for
                // anything else (separators, settings)
                let outputLine = sanitizeTerminalText(line).replace(/ /g, '\u00A0');

                // Add reset code at the beginning to override Claude Code's dim setting
                outputLine = '\x1b[0m' + outputLine;
                outputLines.push(outputLine);

                globalSeparatorIndex = advanceGlobalSeparatorIndex(globalSeparatorIndex, lineItems, preRenderedWidgets);
                if (settings.powerline.enabled) {
                    globalPowerlineStartCapIndex += countPowerlineStartCapSlots(lineItems, preRenderedWidgets);
                }
                if (settings.powerline.enabled && settings.powerline.continueThemeAcrossLines) {
                    // A line with its own theme breaks the cross-line palette
                    // chain: the next line restarts the global sequence at 0.
                    globalPowerlineThemeIndex = hasOwnLineTheme(settings, i)
                        ? 0
                        : advanceGlobalPowerlineThemeIndex(globalPowerlineThemeIndex, preRenderedWidgets);
                }
            }
        }
    }

    // Defensive fallback: if no content line was emitted, ensure the warning is not lost
    if (configError && !configBadgePrepended) {
        outputLines.push('\x1b[0m' + buildConfigWarningBadge(settings.colorLevel).replace(/ /g, '\u00A0'));
    }

    // Check if there's an update message to display
    if (settings.updatemessage?.message
        && settings.updatemessage.message.trim() !== ''
        && settings.updatemessage.remaining
        && settings.updatemessage.remaining > 0) {
        // Display the message
        outputLines.push(sanitizeTerminalText(settings.updatemessage.message));

        // Decrement the remaining count
        const newRemaining = settings.updatemessage.remaining - 1;

        // Update or remove the updatemessage
        if (newRemaining <= 0) {
            // Remove the entire updatemessage block
            const { updatemessage, ...newSettings } = settings;
            await saveSettingsTo(invocation.configPath, newSettings);
        } else {
            // Update the remaining count
            await saveSettingsTo(invocation.configPath, {
                ...settings,
                updatemessage: {
                    ...settings.updatemessage,
                    remaining: newRemaining
                }
            });
        }
    }

    return { text: outputLines.join('\n'), settings, loadError: configError };
}
