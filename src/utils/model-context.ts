export function getContextConfig(modelId?: string): number {
    // Default to 200k for older models
    const defaultConfig = 200000;

    if (!modelId)
        return defaultConfig;

    // Sonnet 4.5 variants with 1M context (requires [1m] suffix for long context beta)
    if (
        modelId.includes('claude-sonnet-4-5')
        && modelId.toLowerCase().includes('[1m]')
    ) {
        return 1000000;
    }

    // Add future models here as needed

    return defaultConfig;
}