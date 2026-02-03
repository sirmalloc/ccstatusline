import { z } from 'zod';

const modelSchema = z.union([
    z.string(),
    z.object({
        id: z.string().optional(),
        display_name: z.string().optional()
    })
]);

const workspaceSchema = z.object({
    current_dir: z.string().optional(),
    project_dir: z.string().optional()
});

const outputStyleSchema = z.object({ name: z.string().optional() });

const costSchema = z.object({
    total_cost_usd: z.number().optional(),
    total_duration_ms: z.number().optional(),
    total_api_duration_ms: z.number().optional(),
    total_lines_added: z.number().optional(),
    total_lines_removed: z.number().optional()
});

const currentUsageSchema = z.object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
    cache_creation_input_tokens: z.number().optional(),
    cache_read_input_tokens: z.number().optional()
});

const contextWindowSchema = z.object({
    total_input_tokens: z.number().optional(),
    total_output_tokens: z.number().optional(),
    context_window_size: z.number().optional(),
    current_usage: currentUsageSchema.nullish(),
    used_percentage: z.number().nullish(),
    remaining_percentage: z.number().nullish()
});

export const StatusJSONSchema = z.looseObject({
    hook_event_name: z.string().optional(),
    session_id: z.string().optional(),
    transcript_path: z.string().optional(),
    cwd: z.string().optional(),
    model: modelSchema.optional(),
    workspace: workspaceSchema.optional(),
    version: z.string().optional(),
    output_style: outputStyleSchema.optional(),
    cost: costSchema.optional(),
    context_window: contextWindowSchema.optional()
});

export type StatusJSON = z.infer<typeof StatusJSONSchema>;
export type ContextWindow = z.infer<typeof contextWindowSchema>;