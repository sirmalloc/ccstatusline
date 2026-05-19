import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Resolves the Claude Code config directory. Inlined (rather than imported
 * from `./claude-settings`) to keep this module free of the widget→settings
 * import cycle. Mirrors `getClaudeConfigDir` semantics for the read path:
 * honor `CLAUDE_CONFIG_DIR` when it points to an existing directory or a
 * path that can be created, falling back to `~/.claude`.
 */
function resolveClaudeConfigDir(): string {
    const envConfigDir = process.env.CLAUDE_CONFIG_DIR;
    if (envConfigDir) {
        try {
            const resolvedPath = path.resolve(envConfigDir);
            if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
                return resolvedPath;
            }
        } catch {
            // Fall through to default.
        }
    }
    return path.join(os.homedir(), '.claude');
}

/**
 * User-configurable overrides that change when Claude Code triggers auto-compact.
 *
 * - `effectiveWindow`: replaces the model's native context window as the
 *   denominator for "% used". Sourced from (in priority order):
 *     1. `CLAUDE_CODE_AUTO_COMPACT_WINDOW` env var
 *     2. `autoCompactWindow` key in any Claude Code settings.json layer
 *     3. unset → caller falls back to the model's native window
 *
 * - `ratio`: the fraction of the effective window that is "usable" before
 *   Claude Code auto-compacts. Sourced from:
 *     1. `DISABLE_AUTO_COMPACT=1` → 1.0 (whole window is usable)
 *     2. `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (1–100) → value/100
 *     3. unset → null (caller uses its own default, typically 0.8)
 *
 * Claude Code itself caps `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` to ~83% via an
 * internal `Math.min`, so a value of 100 will not actually disable compaction
 * — only `DISABLE_AUTO_COMPACT=1` does that. We pass the raw value through
 * (clamped to 1–100) and document the caveat rather than re-implementing CC's
 * undocumented cap.
 *
 * Reference: anthropics/claude-code#46331 (reverse-engineered priority order),
 * jarrodwatts/claude-hud#540 (same bug class in sibling status-line project).
 */
export interface CompactionOverrides {
    effectiveWindow: number | null;
    ratio: number | null;
}

const PCT_OVERRIDE_MIN = 1;
const PCT_OVERRIDE_MAX = 100;

function parseEnvWindow(value: string | undefined): number | null {
    if (typeof value !== 'string') {
        return null;
    }
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

function parseEnvPctRatio(value: string | undefined): number | null {
    if (typeof value !== 'string') {
        return null;
    }
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed < PCT_OVERRIDE_MIN || parsed > PCT_OVERRIDE_MAX) {
        return null;
    }
    return parsed / 100;
}

function isEnvFlagTrue(value: string | undefined): boolean {
    if (typeof value !== 'string') {
        return false;
    }
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true';
}

function getSettingsCandidatePathsByPriority(cwd: string): string[] {
    const userDir = resolveClaudeConfigDir();
    const projectDir = path.join(cwd, '.claude');
    // Match Claude Code's merge order: project > user, .local > base.
    const candidates = [
        path.join(projectDir, 'settings.local.json'),
        path.join(projectDir, 'settings.json'),
        path.join(userDir, 'settings.local.json'),
        path.join(userDir, 'settings.json')
    ];
    return Array.from(new Set(candidates));
}

function tryReadAutoCompactWindow(filePath: string): number | null {
    let content: string;
    try {
        content = fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return null;
    }

    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    const value = (parsed as { autoCompactWindow?: unknown }).autoCompactWindow;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }
    return value;
}

function resolveSettingsAutoCompactWindow(cwd: string): number | null {
    for (const filePath of getSettingsCandidatePathsByPriority(cwd)) {
        const value = tryReadAutoCompactWindow(filePath);
        if (value !== null) {
            return value;
        }
    }
    return null;
}

/**
 * Resolves the effective compaction overrides for the current Claude Code session.
 *
 * Reads env vars from `process.env` (CC exports its `env` settings.json block
 * into the spawned status line process) and walks the same four settings.json
 * layers Claude Code itself merges, returning the highest-priority value for
 * each field.
 *
 * Safe to call on every render — file reads are guarded with try/catch and
 * settings.json lookup stops at the first layer that defines `autoCompactWindow`.
 *
 * @param cwd Working directory to anchor project-scope settings lookup.
 *            Defaults to `process.cwd()`.
 */
export function getCompactionOverrides(cwd: string = process.cwd()): CompactionOverrides {
    const envWindow = parseEnvWindow(process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW);
    const effectiveWindow = envWindow ?? resolveSettingsAutoCompactWindow(cwd);

    const ratio = isEnvFlagTrue(process.env.DISABLE_AUTO_COMPACT)
        ? 1.0
        : parseEnvPctRatio(process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE);

    return { effectiveWindow, ratio };
}
