import type { RenderContext } from '../../types/RenderContext';
import type { StatusJSON } from '../../types/StatusJSON';
import type { HideableState } from '../../types/Widget';
import { formatUsageDuration } from '../../utils/usage-windows';

// Claude Code's prompt cache statistics for the main conversation, from the
// status line payload (Claude Code 2.1.251+). The cache miss widgets read only
// this: no transcript scan and no network.
export type PromptCache = NonNullable<StatusJSON['prompt_cache']>;
type LastMissCause = NonNullable<PromptCache['last_miss_cause']>;

export const NO_MISSES_HIDEABLE_STATE: HideableState = { key: 'zero', label: 'when there are no misses' };

// The documentation's example session, for the TUI preview: 2 misses in 14
// requests, the last 3 minutes ago because 2 tools were added
function getPreviewPromptCache(nowMs: number): PromptCache {
    return {
        requests: 14,
        misses: 2,
        miss_recache_tokens: 310200,
        last_miss_at: Math.floor(nowMs / 1000) - 3 * 60,
        last_miss_cause: { causes: ['tools_changed'], tools_added: 2, tools_removed: 0 },
        recache_tokens_if_cold: 45000
    };
}

export function getPromptCache(context: RenderContext): PromptCache | null {
    if (context.isPreview) {
        return getPreviewPromptCache(Date.now());
    }

    return context.data?.prompt_cache ?? null;
}

export function hasNoMisses(cache: PromptCache): boolean {
    return cache.misses === 0;
}

const MINUS = '−';

function formatSigned(value: number): string {
    return value < 0 ? `${MINUS}${Math.abs(value)}` : `+${value}`;
}

function formatCause(name: string, details: LastMissCause): string {
    if (name === 'tools_changed') {
        const counts = [
            details.tools_added ? `+${details.tools_added}` : null,
            details.tools_removed ? `${MINUS}${details.tools_removed}` : null
        ].filter(count => count !== null);
        return counts.length > 0 ? `tools changed (${counts.join(', ')})` : 'tools changed';
    }

    if (name === 'system_prompt_changed') {
        const delta = details.system_char_delta;
        return delta ? `system prompt changed (${formatSigned(delta)} chars)` : 'system prompt changed';
    }

    const ttl = /^ttl_expired_(.+)$/.exec(name);
    if (ttl) {
        return `${ttl[1]} TTL expired`;
    }

    // likely_server_side and any cause a later Claude Code adds
    return name.replaceAll('_', ' ');
}

// Claude Code leaves last_miss_cause null when it couldn't identify a cause,
// and older versions (before 2.1.260) don't send it at all
export function formatMissCause(cause: LastMissCause | null | undefined): string {
    if (!cause || cause.causes.length === 0) {
        return 'cause unknown';
    }

    return cause.causes.map(name => formatCause(name, cause)).join(', ');
}

export function formatMissAge(lastMissAtSeconds: number, nowMs = Date.now()): string {
    const ageMs = nowMs - lastMissAtSeconds * 1000;
    return ageMs < 60 * 1000 ? 'just now' : `${formatUsageDuration(ageMs, true)} ago`;
}
