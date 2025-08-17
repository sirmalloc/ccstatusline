import { z } from 'zod';

export const StatusJSONSchema = z.looseObject({
    hook_event_name: z.string().optional(),
    session_id: z.string().optional(),
    transcript_path: z.string().optional(),
    cwd: z.string().optional(),
    model: z.object({
        id: z.string().optional(),
        display_name: z.string().optional()
    }).optional(),
    workspace: z.object({
        current_dir: z.string().optional(),
        project_dir: z.string().optional()
    }).optional(),
    version: z.string().optional(),
    output_style: z.object({ name: z.string().optional() }).optional()
});

export type StatusJSON = z.infer<typeof StatusJSONSchema>;