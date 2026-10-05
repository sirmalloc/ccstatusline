import type { RenderContext } from '../../types/RenderContext';

// Usage-based plans (Enterprise) have no plan limits, so extra usage is the
// account's whole spend there, not overage beyond a limit.
export function getExtraUsageLabel(usageData: RenderContext['usageData']): string {
    return usageData?.noPlanLimits === true ? 'Spend' : 'Overage';
}
