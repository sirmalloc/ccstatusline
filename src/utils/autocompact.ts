import { loadClaudeSettingsSync } from './claude-settings';

/**
 * Parse and validate an autocompact percentage value.
 * Must be a finite number between 1 and 100 inclusive.
 */
function parseAutocompactPercent(value: unknown): number | null {
    if (value === undefined || value === null || value === '') {
        return null;
    }

    const num = typeof value === 'number' ? value : Number(value);

    if (!Number.isFinite(num) || num < 1 || num > 100) {
        return null;
    }

    return num;
}

/**
 * Resolve the CLAUDE_AUTOCOMPACT_PCT_OVERRIDE value from available sources.
 *
 * Priority cascade:
 * 1. process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE (shell environment)
 * 2. Claude Code settings.json env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
 * 3. null (no override found)
 *
 * The value must be a number between 1 and 100. Invalid values are skipped.
 */
export function resolveAutocompactPercent(): number | null {
    // 1. Shell environment variable
    const envValue = parseAutocompactPercent(process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);
    if (envValue !== null) {
        return envValue;
    }

    // 2. Claude Code settings.json -> env -> CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
    try {
        const claudeSettings = loadClaudeSettingsSync({ logErrors: false });
        const envRecord = claudeSettings.env;

        if (envRecord && typeof envRecord === 'object') {
            const claudeEnvValue = parseAutocompactPercent(
                (envRecord as Record<string, unknown>).CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
            );
            if (claudeEnvValue !== null) {
                return claudeEnvValue;
            }
        }
    } catch {
        // Claude settings unreadable, skip
    }

    return null;
}