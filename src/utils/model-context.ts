interface ModelContextConfig {
    maxTokens: number;
    usableTokens: number;
}

interface ModelIdentifier {
    id?: string;
    display_name?: string;
}

/**
 * Optional Claude Code compaction overrides that change which window / threshold
 * the "usable" context calculation should respect. Resolved separately (see
 * `getCompactionOverrides` in `./claude-compaction`) so this module stays
 * pure — no fs / env access required for callers that don't need overrides.
 *
 * - `effectiveWindow`: replaces the model's native window size as the
 *   denominator. When set, the model-inferred / status-JSON window is ignored
 *   (mirrors Claude Code's priority: `CLAUDE_CODE_AUTO_COMPACT_WINDOW` env and
 *   `autoCompactWindow` settings.json key both shrink the effective window).
 * - `ratio`: replaces the default 0.8 usable ratio. When set, `usableTokens`
 *   becomes `floor(effectiveWindow * ratio)`. Clamped to (0, 1].
 */
export interface ContextConfigOverrides {
    effectiveWindow?: number | null;
    ratio?: number | null;
}

const DEFAULT_CONTEXT_WINDOW_SIZE = 200000;
const USABLE_CONTEXT_RATIO = 0.8;

function toValidWindowSize(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return value;
}

function resolveUsableRatio(override: number | null | undefined): number {
    if (typeof override !== 'number' || !Number.isFinite(override) || override <= 0) {
        return USABLE_CONTEXT_RATIO;
    }
    return Math.min(override, 1);
}

function buildConfig(windowSize: number, ratio: number): ModelContextConfig {
    return {
        maxTokens: windowSize,
        usableTokens: Math.floor(windowSize * ratio)
    };
}

function parseContextWindowSize(modelIdentifier: string): number | null {
    const delimitedMatch = /(?:\(|\[)\s*(\d+(?:[,_]\d+)*(?:\.\d+)?)\s*([km])\s*(?:\)|\])/i.exec(modelIdentifier);
    if (delimitedMatch) {
        const delimitedValue = delimitedMatch[1];
        const delimitedUnit = delimitedMatch[2];
        if (!delimitedValue || !delimitedUnit) {
            return null;
        }

        const parsed = Number.parseFloat(delimitedValue.replace(/[,_]/g, ''));
        if (Number.isFinite(parsed) && parsed > 0) {
            return Math.round(parsed * (delimitedUnit.toLowerCase() === 'm' ? 1000000 : 1000));
        }
    }

    const contextMatch = /\b(\d+(?:[,_]\d+)*(?:\.\d+)?)\s*([km])(?:\s*(?:token\s*)?context)?\b/i.exec(modelIdentifier);
    if (!contextMatch) {
        return null;
    }

    const contextValue = contextMatch[1];
    const contextUnit = contextMatch[2];
    if (!contextValue || !contextUnit) {
        return null;
    }

    const parsed = Number.parseFloat(contextValue.replace(/[,_]/g, ''));
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }

    return Math.round(parsed * (contextUnit.toLowerCase() === 'm' ? 1000000 : 1000));
}

export function getModelContextIdentifier(model?: string | ModelIdentifier): string | undefined {
    if (typeof model === 'string') {
        const trimmed = model.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    if (!model) {
        return undefined;
    }

    const id = model.id?.trim();
    const displayName = model.display_name?.trim();

    if (id && displayName) {
        return `${id} ${displayName}`;
    }

    return id ?? displayName;
}

/**
 * Resolves the `{maxTokens, usableTokens}` context window pair for a session.
 *
 * Priority for `maxTokens` (highest first):
 *   1. `overrides.effectiveWindow` — Claude Code compaction window override
 *      (`CLAUDE_CODE_AUTO_COMPACT_WINDOW` env or `autoCompactWindow` settings.json).
 *      This shrinks the *effective* window CC will let the conversation grow into,
 *      so it takes precedence over the model's actual capacity.
 *   2. `contextWindowSize` — status JSON's reported `context_window_size`.
 *   3. Window inferred from the model identifier (e.g. `[1m]` suffix).
 *   4. `DEFAULT_CONTEXT_WINDOW_SIZE` (200k) for older / unknown models.
 *
 * `usableTokens` is `floor(maxTokens * ratio)` where `ratio` defaults to 0.8
 * but is replaced by `overrides.ratio` when set (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`
 * or `DISABLE_AUTO_COMPACT=1`).
 */
export function getContextConfig(
    modelIdentifier?: string,
    contextWindowSize?: number | null,
    overrides?: ContextConfigOverrides
): ModelContextConfig {
    const ratio = resolveUsableRatio(overrides?.ratio);

    const overrideWindow = toValidWindowSize(overrides?.effectiveWindow);
    if (overrideWindow !== null) {
        return buildConfig(overrideWindow, ratio);
    }

    const statusWindowSize = toValidWindowSize(contextWindowSize);
    if (statusWindowSize !== null) {
        return buildConfig(statusWindowSize, ratio);
    }

    if (modelIdentifier) {
        const inferredWindowSize = parseContextWindowSize(modelIdentifier);
        if (inferredWindowSize !== null) {
            return buildConfig(inferredWindowSize, ratio);
        }
    }

    return buildConfig(DEFAULT_CONTEXT_WINDOW_SIZE, ratio);
}
