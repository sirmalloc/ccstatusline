import type { NumberFormat } from '../types/NumberFormat';

import {
    effectiveDecimals,
    renderMagnitude
} from './number-format';

// Format a token count, applying the optional `format` (style/decimals) on top
// of the "k"-range `decimals` baseline. Once the k value would round up to
// "1000" at the effective precision (within half a displayed unit of 1M),
// promote to the "M" range — at 1 decimal that boundary is 999_950, at 0 it is
// 999_500. `decimals` defaults to 1; callers wanting compact whole-number k pass
// 0. With no `format`, output is unchanged ("1.0M", "512.0k").
export function formatTokens(count: number, format: NumberFormat = {}, decimals = 1): string {
    const kDecimals = effectiveDecimals(format, decimals);
    if (count >= 1000000 - 500 / 10 ** kDecimals)
        return `${renderMagnitude(count / 1000000, format, 1)}M`;
    if (count >= 1000)
        return `${renderMagnitude(count / 1000, format, decimals)}k`;
    return count.toString();
}
