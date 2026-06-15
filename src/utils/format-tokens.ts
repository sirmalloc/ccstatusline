export function formatTokens(count: number): string {
    // 999_950+ rounds to "1000.0k" at one decimal place; render it as "1.0M" instead.
    if (count >= 999950)
        return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000)
        return `${(count / 1000).toFixed(1)}k`;
    return count.toString();
}
