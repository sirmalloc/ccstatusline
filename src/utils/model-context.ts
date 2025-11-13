interface ModelContextConfig {
  maxTokens: number;
  usableTokens: number;
}

export function getContextConfig(modelId?: string): ModelContextConfig {
  // Default to 200k for older models
  const defaultConfig = {
    maxTokens: 200000,
    usableTokens: 160000,
  };

  if (!modelId) return defaultConfig;

  // Sonnet 4.5 variants with 1M context (requires [1m] suffix for long context beta)
  if (
    modelId.includes("claude-sonnet-4-5") &&
    modelId.toLowerCase().includes("[1m]")
  ) {
    return {
      maxTokens: 1000000,
      usableTokens: 800000, // 80% of 1M
    };
  }

  // Add future models here as needed

  return defaultConfig;
}
