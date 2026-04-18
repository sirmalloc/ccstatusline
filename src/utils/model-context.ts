interface ModelContextConfig {
    maxTokens: number;
    usableTokens: number;
}

interface ModelIdentifier {
    id?: string;
    display_name?: string;
}

const DEFAULT_CONTEXT_WINDOW_SIZE = 200000;

/**
 * Tokens reserved for the autocompact summary output.
 * Claude Code reserves min(modelMaxOutputTokens, 20000) tokens;
 * all current models have max_output >= 20k so this is always 20,000.
 */
const RESERVED_TOKENS_FOR_SUMMARY = 20_000;

/**
 * Fixed buffer subtracted from the effective window to arrive at the
 * default autocompact threshold.
 */
const AUTOCOMPACT_BUFFER_TOKENS = 13_000;

function toValidWindowSize(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return value;
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
 * Compute the usable-token threshold for a given context window.
 *
 * Default formula (matches Claude Code autocompact):
 *   effectiveWindow = contextWindow - RESERVED_TOKENS_FOR_SUMMARY
 *   threshold       = effectiveWindow - AUTOCOMPACT_BUFFER_TOKENS
 *
 * With an optional percentage override (1-100):
 *   pctThreshold    = floor(effectiveWindow * pct / 100)
 *   threshold       = min(pctThreshold, defaultThreshold)   // can only lower
 */
function computeUsableTokens(contextWindow: number, autocompactPercent?: number | null): number {
    const effectiveWindow = contextWindow - RESERVED_TOKENS_FOR_SUMMARY;
    const defaultThreshold = effectiveWindow - AUTOCOMPACT_BUFFER_TOKENS;

    if (
        typeof autocompactPercent === 'number'
        && Number.isFinite(autocompactPercent)
        && autocompactPercent >= 1
        && autocompactPercent <= 100
    ) {
        const pctThreshold = Math.floor(effectiveWindow * autocompactPercent / 100);
        return Math.max(1, Math.min(pctThreshold, defaultThreshold));
    }

    return Math.max(1, defaultThreshold);
}

export function getContextConfig(
    modelIdentifier?: string,
    contextWindowSize?: number | null,
    autocompactPercent?: number | null
): ModelContextConfig {
    const statusWindowSize = toValidWindowSize(contextWindowSize);
    if (statusWindowSize !== null) {
        return {
            maxTokens: statusWindowSize,
            usableTokens: computeUsableTokens(statusWindowSize, autocompactPercent)
        };
    }

    // Default to 200k for older models
    const defaultConfig = {
        maxTokens: DEFAULT_CONTEXT_WINDOW_SIZE,
        usableTokens: computeUsableTokens(DEFAULT_CONTEXT_WINDOW_SIZE, autocompactPercent)
    };

    if (!modelIdentifier) {
        return defaultConfig;
    }

    const inferredWindowSize = parseContextWindowSize(modelIdentifier);
    if (inferredWindowSize !== null) {
        return {
            maxTokens: inferredWindowSize,
            usableTokens: computeUsableTokens(inferredWindowSize, autocompactPercent)
        };
    }

    return defaultConfig;
}