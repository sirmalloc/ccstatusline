import { z } from 'zod';

import { ColorLevelSchema } from './ColorLevel';
import { FlexModeSchema } from './FlexMode';
import { PowerlineConfigSchema } from './PowerlineConfig';
import { WidgetItemSchema } from './Widget';

// Current version - bump this when making breaking changes to the schema
export const CURRENT_VERSION = 4;

export const InstallationMetadataSchema = z.discriminatedUnion('method', [
    z.object({
        method: z.literal('auto-update'),
        packageManager: z.enum(['npm', 'bun'])
    }),
    z.object({
        method: z.literal('pinned'),
        installedVersion: z.string().optional()
    }),
    z.object({
        method: z.literal('self-managed'),
        packageManager: z.enum(['npm', 'bun', 'unknown']).default('unknown')
    }),
    z.object({
        method: z.literal('unknown'),
        packageManager: z.enum(['npm', 'bun', 'unknown']).default('unknown')
    })
]);

// Schema for v1 settings (before version field was added)
export const SettingsSchema_v1 = z.object({
    lines: z.array(z.array(WidgetItemSchema)).optional(),
    flexMode: FlexModeSchema.optional(),
    compactThreshold: z.number().optional(),
    colorLevel: ColorLevelSchema.optional(),
    defaultSeparator: z.string().optional(),
    defaultPadding: z.string().optional(),
    inheritSeparatorColors: z.boolean().optional(),
    overrideBackgroundColor: z.string().optional(),
    overrideForegroundColor: z.string().optional(),
    globalBold: z.boolean().optional()
});

// Main settings schema with defaults
export const SettingsSchema = z.object({
    version: z.number().default(CURRENT_VERSION),
    lines: z.array(z.array(WidgetItemSchema))
        .min(1)
        .default([
            [
                { id: '1', type: 'model', color: 'cyan' },
                { id: '2', type: 'separator' },
                { id: '3', type: 'context-length', color: 'brightBlack' },
                { id: '4', type: 'separator' },
                { id: '5', type: 'git-branch', color: 'magenta' },
                { id: '6', type: 'separator' },
                { id: '7', type: 'git-changes', color: 'yellow' }
            ],
            [],
            []
        ]), // Ensure max 3 lines
    flexMode: FlexModeSchema.default('full-minus-40'),
    compactThreshold: z.number().min(1).max(99).default(60),
    colorLevel: ColorLevelSchema.default(2),
    defaultSeparator: z.string().optional(),
    defaultPadding: z.string().optional(),
    inheritSeparatorColors: z.boolean().default(false),
    overrideBackgroundColor: z.string().optional(),
    overrideForegroundColor: z.string().optional(),
    globalBold: z.boolean().default(false),
    gitCacheTtlSeconds: z.number().min(0).max(60).default(5),
    minimalistMode: z.boolean().default(false),
    powerline: PowerlineConfigSchema.default({
        enabled: false,
        separators: ['\uE0B0'],
        separatorInvertBackground: [false],
        startCaps: [],
        endCaps: [],
        theme: undefined,
        autoAlign: false,
        continueThemeAcrossLines: false
    }),
    updatemessage: z.object({
        message: z.string().nullable().optional(),
        remaining: z.number().nullable().optional()
    }).optional(),
    installation: InstallationMetadataSchema.optional()
});

// Inferred type from schema
export type Settings = z.infer<typeof SettingsSchema>;
export type InstallationMetadata = z.infer<typeof InstallationMetadataSchema>;
export type ResolvedInstallationMetadata
    = | Exclude<InstallationMetadata, { method: 'pinned' }>
        | (Extract<InstallationMetadata, { method: 'pinned' }> & { packageManager: 'npm' | 'bun' | 'unknown' });

// Export a default settings constant for reference
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});
