// Format a token count with `decimals` places in the "k" range. Once the k
// value would round up to "1000" at that precision (within half a displayed
// unit of 1M), promote to "1.0M" instead — at decimals=1 that boundary is
// 999_950 ("1000.0k" -> "1.0M"), at decimals=0 it is 999_500 ("1000k" -> "1.0M").
// decimals defaults to 1; callers wanting a compact whole-number k pass 0.
export function formatTokens(count: number, decimals = 1): string {
    if (count >= 1000000 - 500 / 10 ** decimals)
        return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000)
        return `${(count / 1000).toFixed(decimals)}k`;
    return count.toString();
}
