import { z } from 'zod';

// Decimal-rendering styles for numeric widgets:
//   precise - fixed decimal places, trailing zeros kept ("1.0M"); today's default
//   compact - trailing zeros trimmed, real fractions kept ("1M", "1.1M")
//   whole   - no decimals ("1M")
export const NUMBER_STYLES = ['precise', 'compact', 'whole'] as const;
export type NumberStyle = (typeof NUMBER_STYLES)[number];

// The kind of number a widget renders. Each kind keeps its own baseline
// precision in its formatter, so a token-oriented change never drags money off
// its 2-decimal convention.
export const NUMBER_KINDS = ['token', 'speed', 'percent', 'memory', 'cost'] as const;
export type NumberKind = (typeof NUMBER_KINDS)[number];

// A precision override. Both fields optional; an empty format means "use the
// formatter's built-in baseline", i.e. current output.
export const NumberFormatSchema = z.object({
    style: z.enum(NUMBER_STYLES).optional(),
    decimals: z.number().int().min(0).max(6).optional()
});
export type NumberFormat = z.infer<typeof NumberFormatSchema>;

// Optional global precision, keyed by number kind. A kind set here wins over any
// per-widget value (same precedence as overrideForegroundColor / globalBold).
export const GlobalNumberFormatSchema = z.object({
    token: NumberFormatSchema.optional(),
    speed: NumberFormatSchema.optional(),
    percent: NumberFormatSchema.optional(),
    memory: NumberFormatSchema.optional(),
    cost: NumberFormatSchema.optional()
});
export type GlobalNumberFormat = z.infer<typeof GlobalNumberFormatSchema>;
