import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface EnvironmentData {
    claudeMdCount: number;
    rulesCount: number;
    mcpCount: number;
    hooksCount: number;
}

// Valid keys for disabled MCP arrays in config files
type DisabledMcpKey = 'disabledMcpServers' | 'disabledMcpjsonServers';

function getClaudeConfigDir(homeDir: string): string {
    return process.env.CLAUDE_CONFIG_DIR ?? path.join(homeDir, '.claude');
}

function getClaudeConfigJsonPath(homeDir: string): string {
    return path.join(homeDir, '.claude.json');
}

function getMcpServerNames(filePath: string): Set<string> {
    if (!fs.existsSync(filePath))
        return new Set();
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const config = JSON.parse(content) as Record<string, unknown>;
        const mcpServers = config.mcpServers;
        if (mcpServers && typeof mcpServers === 'object') {
            return new Set(Object.keys(mcpServers));
        }
    } catch {
    // Silently ignore read/parse errors
    }
    return new Set();
}

function getDisabledMcpServers(filePath: string, key: DisabledMcpKey): Set<string> {
    if (!fs.existsSync(filePath))
        return new Set();
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const config = JSON.parse(content) as Record<string, unknown>;
        const value = config[key];
        if (Array.isArray(value)) {
            const validNames = (value as unknown[]).filter((s): s is string => typeof s === 'string');
            return new Set(validNames);
        }
    } catch {
    // Silently ignore read/parse errors
    }
    return new Set();
}

function countHooksInFile(filePath: string): number {
    if (!fs.existsSync(filePath))
        return 0;
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const config = JSON.parse(content) as Record<string, unknown>;
        const hooks = config.hooks;
        if (hooks && typeof hooks === 'object') {
            return Object.keys(hooks).length;
        }
    } catch {
    // Silently ignore read/parse errors
    }
    return 0;
}

function countRulesInDir(rulesDir: string): number {
    if (!fs.existsSync(rulesDir))
        return 0;
    let count = 0;
    try {
        const entries = fs.readdirSync(rulesDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(rulesDir, entry.name);
            if (entry.isDirectory()) {
                count += countRulesInDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                count++;
            }
        }
    } catch {
    // Silently ignore read errors
    }
    return count;
}

function normalizePathForComparison(inputPath: string): string {
    let normalized = path.normalize(path.resolve(inputPath));
    const root = path.parse(normalized).root;
    while (normalized.length > root.length && normalized.endsWith(path.sep)) {
        normalized = normalized.slice(0, -1);
    }
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function pathsReferToSameLocation(pathA: string, pathB: string): boolean {
    if (normalizePathForComparison(pathA) === normalizePathForComparison(pathB)) {
        return true;
    }

    if (!fs.existsSync(pathA) || !fs.existsSync(pathB)) {
        return false;
    }

    try {
        const realPathA = fs.realpathSync.native(pathA);
        const realPathB = fs.realpathSync.native(pathB);
        return normalizePathForComparison(realPathA) === normalizePathForComparison(realPathB);
    } catch {
        return false;
    }
}

export function countEnvironment(cwd?: string): EnvironmentData {
    let claudeMdCount = 0;
    let rulesCount = 0;
    let hooksCount = 0;

    const homeDir = os.homedir();
    const claudeDir = getClaudeConfigDir(homeDir);

    // Collect all MCP servers across scopes, then subtract disabled ones
    const userMcpServers = new Set<string>();
    const projectMcpServers = new Set<string>();

    // === USER SCOPE ===

    // ~/.claude/CLAUDE.md
    if (fs.existsSync(path.join(claudeDir, 'CLAUDE.md'))) {
        claudeMdCount++;
    }

    // ~/.claude/rules/*.md
    rulesCount += countRulesInDir(path.join(claudeDir, 'rules'));

    // ~/.claude/settings.json (MCPs and hooks)
    const userSettings = path.join(claudeDir, 'settings.json');
    for (const name of getMcpServerNames(userSettings)) {
        userMcpServers.add(name);
    }
    hooksCount += countHooksInFile(userSettings);

    // {CLAUDE_CONFIG_DIR}.json (additional user-scope MCPs)
    const userClaudeJson = getClaudeConfigJsonPath(homeDir);
    for (const name of getMcpServerNames(userClaudeJson)) {
        userMcpServers.add(name);
    }

    // Get disabled user-scope MCPs from ~/.claude.json
    const disabledUserMcps = getDisabledMcpServers(userClaudeJson, 'disabledMcpServers');
    for (const name of disabledUserMcps) {
        userMcpServers.delete(name);
    }

    // === PROJECT SCOPE ===

    // Avoid double-counting when project .claude directory is the same location as user scope.
    const projectClaudeDir = cwd ? path.join(cwd, '.claude') : null;
    const projectClaudeOverlapsUserScope = projectClaudeDir
        ? pathsReferToSameLocation(projectClaudeDir, claudeDir)
        : false;

    if (cwd) {
    // {cwd}/CLAUDE.md
        if (fs.existsSync(path.join(cwd, 'CLAUDE.md'))) {
            claudeMdCount++;
        }

        // {cwd}/CLAUDE.local.md
        if (fs.existsSync(path.join(cwd, 'CLAUDE.local.md'))) {
            claudeMdCount++;
        }

        // {cwd}/.claude/CLAUDE.md (alternative location, skip when it is user scope)
        if (!projectClaudeOverlapsUserScope && fs.existsSync(path.join(cwd, '.claude', 'CLAUDE.md'))) {
            claudeMdCount++;
        }

        // {cwd}/.claude/CLAUDE.local.md
        if (fs.existsSync(path.join(cwd, '.claude', 'CLAUDE.local.md'))) {
            claudeMdCount++;
        }

        // {cwd}/.claude/rules/*.md (recursive)
        // Skip when it overlaps with user-scope rules.
        if (!projectClaudeOverlapsUserScope) {
            rulesCount += countRulesInDir(path.join(cwd, '.claude', 'rules'));
        }

        // {cwd}/.mcp.json (project MCP config) - tracked separately for disabled filtering
        const mcpJsonServers = getMcpServerNames(path.join(cwd, '.mcp.json'));

        // {cwd}/.claude/settings.json (project settings)
        // Skip when it overlaps with user-scope settings.
        const projectSettings = path.join(cwd, '.claude', 'settings.json');
        if (!projectClaudeOverlapsUserScope) {
            for (const name of getMcpServerNames(projectSettings)) {
                projectMcpServers.add(name);
            }
            hooksCount += countHooksInFile(projectSettings);
        }

        // {cwd}/.claude/settings.local.json (local project settings)
        const localSettings = path.join(cwd, '.claude', 'settings.local.json');
        for (const name of getMcpServerNames(localSettings)) {
            projectMcpServers.add(name);
        }
        hooksCount += countHooksInFile(localSettings);

        // Get disabled .mcp.json servers from settings.local.json
        const disabledMcpJsonServers = getDisabledMcpServers(localSettings, 'disabledMcpjsonServers');
        for (const name of disabledMcpJsonServers) {
            mcpJsonServers.delete(name);
        }

        // Add remaining .mcp.json servers to project set
        for (const name of mcpJsonServers) {
            projectMcpServers.add(name);
        }
    }

    // Total MCP count = user servers + project servers
    // Note: Deduplication only occurs within each scope, not across scopes.
    // A server with the same name in both user and project scope counts as 2 (separate configs).
    const mcpCount = userMcpServers.size + projectMcpServers.size;

    return { claudeMdCount, rulesCount, mcpCount, hooksCount };
}