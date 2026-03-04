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
    }).optional(),
    version: z.string().optional(),
    output_style: z.object({ name: z.string().optional() }).optional(),
    cost: z.object({
        total_cost_usd: CoercedNumberSchema.optional(),
        total_duration_ms: CoercedNumberSchema.optional(),
        total_api_duration_ms: CoercedNumberSchema.optional(),
        total_lines_added: CoercedNumberSchema.optional(),
        total_lines_removed: CoercedNumberSchema.optional()
    }).optional(),
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
    }).nullable().optional()
});

export type StatusJSON = z.infer<typeof StatusJSONSchema>;