import type { RenderContext } from '../types/RenderContext';
import {
    getAutoCompactConfig,
    resolveClaudeConfigCwd
} from '../utils/claude-settings';
import { getContextWindowMetrics } from '../utils/context-window';
import {
    getContextConfig,
    getModelContextIdentifier
} from '../utils/model-context';

import { ContextPercentageWidgetBase } from './shared/context-percentage-widget-base';

export class ContextPercentageUsableWidget extends ContextPercentageWidgetBase {
    protected readonly labelPrefix = 'Ctx(u)';
    protected readonly previewUsedPercent = 11.6;

    getDefaultColor(): string { return 'green'; }
    getDescription(): string { return 'Shows used or remaining context against an estimated compaction budget.\nHonors Claude Code compaction settings and environment overrides; defaults to an 80% estimate.'; }
    getDisplayName(): string { return 'Context % (usable)'; }

    protected getUsedPercentage(context: RenderContext): number | null {
        const modelIdentifier = getModelContextIdentifier(context.data?.model);
        const contextWindowMetrics = getContextWindowMetrics(context.data);
        const autoCompact = getAutoCompactConfig(resolveClaudeConfigCwd(context));
        const contextConfig = getContextConfig(modelIdentifier, contextWindowMetrics.windowSize, autoCompact);
        const contextLength = contextWindowMetrics.contextLengthTokens ?? context.tokenMetrics?.contextLength ?? null;
        return contextLength === null ? null : Math.min(100, (contextLength / contextConfig.usableTokens) * 100);
    }
}
