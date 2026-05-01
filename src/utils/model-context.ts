interface ModelContextConfig {
    maxTokens: number;
    usableTokens: number;
}

interface ModelIdentifier {
    id?: string;
    display_name?: string;
}

const DEFAULT_CONTEXT_WINDOW_SIZE = 200000;
const USABLE_CONTEXT_RATIO = 0.8;
const CONTEXT_WINDOW_ENV_VAR = 'CCSTATUSLINE_CONTEXT_WINDOW_SIZE';

function toValidWindowSize(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return value;
}

const CONTEXT_WINDOW_ENV_REGEX = /^(\d+(?:[,_]\d+)*(?:\.\d+)?)\s*([km])?$/i;

let cachedEnvRaw: string | undefined;
let cachedEnvResult: number | null = null;
let hasCachedEnv = false;

function parseContextWindowEnvValue(raw: string): number | null {
    const trimmed = raw.trim();
    if (!trimmed) {
        return null;
    }

    const suffixMatch = CONTEXT_WINDOW_ENV_REGEX.exec(trimmed);
    const numericPart = suffixMatch?.[1];
    if (!numericPart) {
        return null;
    }

    const numeric = Number.parseFloat(numericPart.replace(/[,_]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
    }

    const unit = suffixMatch[2]?.toLowerCase();
    const multiplier = unit === 'm' ? 1000000 : unit === 'k' ? 1000 : 1;
    const result = Math.round(numeric * multiplier);

    // Reject nonsensical tiny windows (e.g. "1.5" without a unit rounds to 2).
    if (result < 1000) {
        return null;
    }

    return result;
}

function getContextWindowEnvOverride(): number | null {
    const raw = process.env[CONTEXT_WINDOW_ENV_VAR];
    if (hasCachedEnv && raw === cachedEnvRaw) {
        return cachedEnvResult;
    }

    cachedEnvRaw = raw;
    cachedEnvResult = raw === undefined ? null : parseContextWindowEnvValue(raw);
    hasCachedEnv = true;
    return cachedEnvResult;
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

export function getContextConfig(modelIdentifier?: string, contextWindowSize?: number | null): ModelContextConfig {
    const envOverride = getContextWindowEnvOverride();
    if (envOverride !== null) {
        return {
            maxTokens: envOverride,
            usableTokens: Math.floor(envOverride * USABLE_CONTEXT_RATIO)
        };
    }

    const statusWindowSize = toValidWindowSize(contextWindowSize);
    if (statusWindowSize !== null) {
        return {
            maxTokens: statusWindowSize,
            usableTokens: Math.floor(statusWindowSize * USABLE_CONTEXT_RATIO)
        };
    }

    // Default to 200k for older models
    const defaultConfig = {
        maxTokens: DEFAULT_CONTEXT_WINDOW_SIZE,
        usableTokens: Math.floor(DEFAULT_CONTEXT_WINDOW_SIZE * USABLE_CONTEXT_RATIO)
    };

    if (!modelIdentifier) {
        return defaultConfig;
    }

    const inferredWindowSize = parseContextWindowSize(modelIdentifier);
    if (inferredWindowSize !== null) {
        return {
            maxTokens: inferredWindowSize,
            usableTokens: Math.floor(inferredWindowSize * USABLE_CONTEXT_RATIO)
        };
    }

    return defaultConfig;
}
