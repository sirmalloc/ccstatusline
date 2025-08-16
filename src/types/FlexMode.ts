import { z } from 'zod';

// Schema for terminal width handling modes
export const FlexModeSchema = z.enum(['full', 'full-minus-40', 'full-until-compact']);

// Inferred type from schema
export type FlexMode = z.infer<typeof FlexModeSchema>;