import { z } from 'zod';

const CoercedNumberSchema = z.preprocess((value) => {
    if (typeof value !== 'string') {
        return value;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0) {
        return value;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : value;
}, z.number());

const RateLimitPeriodSchema = z.object({
    used_percentage: CoercedNumberSchema.nullable().optional(),
    resets_at: CoercedNumberSchema.nullable().optional() // Unix epoch seconds
});

// Claude apps gateway spend limit (Claude Code 2.1.251+). The dollar fields and
// period arrive separately from the percentage, so they can be absent.
const SpendLimitSchema = RateLimitPeriodSchema.extend({
    used_usd: CoercedNumberSchema.nullable().optional(),
    limit_usd: CoercedNumberSchema.nullable().optional(),
    period: z.string().nullable().optional()
});

export type RateLimitPeriod = z.infer<typeof RateLimitPeriodSchema>;

// A field Claude Code sends in a shape this version doesn't know is dropped,
// so the rest of the payload (and the status line) still renders.
function tolerant<T extends z.ZodType>(schema: T) {
    return schema.nullable().optional().catch(undefined);
}

// The likely cause of the last prompt cache miss (Claude Code 2.1.260+): cause
// names such as tools_changed, plus counts for some of them.
const LastMissCauseSchema = z.looseObject({
    causes: z.array(z.string()).catch([]),
    tools_added: tolerant(CoercedNumberSchema),
    tools_removed: tolerant(CoercedNumberSchema),
    system_char_delta: tolerant(CoercedNumberSchema)
});

// Prompt cache statistics for the main conversation (Claude Code 2.1.251+).
// Absent until the session's first API response. Timestamps are epoch seconds.
const PromptCacheSchema = z.object({
    warm: tolerant(z.boolean()),
    caching_observed: tolerant(z.boolean()),
    ttl: tolerant(z.string()),
    expires_at: tolerant(CoercedNumberSchema),
    requests: tolerant(CoercedNumberSchema),
    misses: tolerant(CoercedNumberSchema),
    expected_rebuilds: tolerant(CoercedNumberSchema),
    hit_ratio: tolerant(CoercedNumberSchema),
    cache_write_tokens: tolerant(CoercedNumberSchema),
    miss_recache_tokens: tolerant(CoercedNumberSchema),
    last_miss_at: tolerant(CoercedNumberSchema),
    last_miss_cause: tolerant(LastMissCauseSchema),
    miss_causes: tolerant(z.record(z.string(), CoercedNumberSchema)),
    recache_tokens_if_cold: tolerant(CoercedNumberSchema)
});

export const StatusJSONSchema = z.looseObject({
    hook_event_name: z.string().optional(),
    session_id: z.string().optional(),
    transcript_path: z.string().optional(),
    cwd: z.string().optional(),
    model: z.union([
        z.string(),
        z.object({
            id: z.string().optional(),
            display_name: z.string().optional()
        })
    ]).optional(),
    workspace: z.object({
        current_dir: z.string().optional(),
        project_dir: z.string().optional()
    }).nullable().optional(),
    version: z.string().nullable().optional(),
    output_style: z.object({ name: z.string().optional() }).nullable().optional(),
    effort: z.object({ level: z.string().nullable().optional() }).nullable().optional(),
    cost: z.object({
        total_cost_usd: CoercedNumberSchema.optional(),
        total_duration_ms: CoercedNumberSchema.optional(),
        total_api_duration_ms: CoercedNumberSchema.optional(),
        total_lines_added: CoercedNumberSchema.optional(),
        total_lines_removed: CoercedNumberSchema.optional()
    }).nullable().optional(),
    context_window: z.object({
        context_window_size: CoercedNumberSchema.nullable().optional(),
        total_input_tokens: CoercedNumberSchema.nullable().optional(),
        total_output_tokens: CoercedNumberSchema.nullable().optional(),
        current_usage: z.union([
            CoercedNumberSchema,
            z.object({
                input_tokens: CoercedNumberSchema.optional(),
                output_tokens: CoercedNumberSchema.optional(),
                cache_creation_input_tokens: CoercedNumberSchema.optional(),
                cache_read_input_tokens: CoercedNumberSchema.optional()
            })
        ]).nullable().optional(),
        used_percentage: CoercedNumberSchema.nullable().optional(),
        remaining_percentage: CoercedNumberSchema.nullable().optional()
    }).nullable().optional(),
    vim: z.object({ mode: z.string().optional() }).nullable().optional(),
    worktree: z.object({
        name: z.string().optional(),
        path: z.string().optional(),
        branch: z.string().optional(),
        original_cwd: z.string().optional(),
        original_branch: z.string().optional()
    }).nullable().optional(),
    rate_limits: z.object({
        five_hour: RateLimitPeriodSchema.optional(),
        seven_day: RateLimitPeriodSchema.optional(),
        seven_day_sonnet: RateLimitPeriodSchema.nullable().optional(),
        seven_day_opus: RateLimitPeriodSchema.nullable().optional(),
        spend_limit: SpendLimitSchema.nullable().optional()
    }).nullable().optional(),
    prompt_cache: tolerant(PromptCacheSchema)
});

export type StatusJSON = z.infer<typeof StatusJSONSchema>;
