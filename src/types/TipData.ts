import { z } from 'zod';

export const TipFileSchema = z.object({
    version: z.string(),
    previousVersion: z.string(),
    generatedAt: z.string(),
    tips: z.array(z.string()),
    changelog: z.string().optional()
});

export type TipFile = z.infer<typeof TipFileSchema>;

export const LastVersionSchema = z.object({
    version: z.string(),
    checkedAt: z.string()
});

export type LastVersion = z.infer<typeof LastVersionSchema>;

export const TipIndexSchema = z.object({
    index: z.number(),
    renderCount: z.number(),
    updatedAt: z.string()
});

export type TipIndex = z.infer<typeof TipIndexSchema>;
