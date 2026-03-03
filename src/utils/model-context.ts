interface ModelContextConfig {
    maxTokens: number;
    usableTokens: number;
}

function toValidWindowSize(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return value;
}

export function getContextConfig(modelId?: string, contextWindowSize?: number | null): ModelContextConfig {
    const statusWindowSize = toValidWindowSize(contextWindowSize);
    if (statusWindowSize !== null) {
        return {
            maxTokens: statusWindowSize,
            usableTokens: Math.floor(statusWindowSize * 0.8)
        };
    }

    // Default to 200k for older models
    const defaultConfig = {
        maxTokens: 200000,
        usableTokens: 160000
    };

    if (!modelId)
        return defaultConfig;

    // Any model with [1m] suffix has 1M context
    if (modelId.toLowerCase().includes('[1m]')) {
        return {
            maxTokens: 1000000,
            usableTokens: 800000 // 80% of 1M
        };
    }

    // Add future models here as needed

    return defaultConfig;
}