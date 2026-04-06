import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi
} from 'vitest';

import { countEnvironment } from '../environment-counter';

let mockedHomedir: ReturnType<typeof vi.spyOn<typeof os, 'homedir'>>;

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'env-counter-test-'));
}

function writeJson(filePath: string, data: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data));
}

function writeFile(filePath: string, content = ''): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
}

describe('countEnvironment', () => {
    let savedConfigDir: string | undefined;

    beforeEach(() => {
        savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
        delete process.env.CLAUDE_CONFIG_DIR;
        mockedHomedir = vi.spyOn(os, 'homedir');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        if (savedConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
        }
    });

    describe('basic counting', () => {
        it('counts CLAUDE.md files, rules, MCP servers, and hooks', () => {
            const homeDir = createTempDir();
            const cwd = createTempDir();
            mockedHomedir.mockReturnValue(homeDir);

            const claudeDir = path.join(homeDir, '.claude');

            // User-scope CLAUDE.md
            writeFile(path.join(claudeDir, 'CLAUDE.md'), '# User CLAUDE.md');

            // User-scope rules
            writeFile(path.join(claudeDir, 'rules', 'rule1.md'), '# Rule 1');
            writeFile(path.join(claudeDir, 'rules', 'rule2.md'), '# Rule 2');

            // User-scope settings with MCP servers and hooks
            writeJson(path.join(claudeDir, 'settings.json'), {
                mcpServers: { server1: {}, server2: {} },
                hooks: { preCommit: {}, postCommit: {}, lint: {} }
            });

            // Project-scope CLAUDE.md
            writeFile(path.join(cwd, 'CLAUDE.md'), '# Project CLAUDE.md');

            const result = countEnvironment(cwd);

            expect(result.claudeMdCount).toBe(2);   // user + project
            expect(result.rulesCount).toBe(2);       // 2 rule files
            expect(result.mcpCount).toBe(2);          // 2 MCP servers
            expect(result.hooksCount).toBe(3);        // 3 hooks
        });
    });

    describe('disabled MCP subtraction', () => {
        it('subtracts disabled MCP servers from the count', () => {
            const homeDir = createTempDir();
            const cwd = createTempDir();
            mockedHomedir.mockReturnValue(homeDir);

            const claudeDir = path.join(homeDir, '.claude');

            // Settings with 3 MCP servers
            writeJson(path.join(claudeDir, 'settings.json'), { mcpServers: { serverA: {}, serverB: {}, serverC: {} } });

            // ~/.claude.json disables one of them
            writeJson(path.join(homeDir, '.claude.json'), { disabledMcpServers: ['serverB'] });

            const result = countEnvironment(cwd);

            expect(result.mcpCount).toBe(2); // 3 - 1 disabled
        });
    });

    describe('empty directory', () => {
        it('returns zero counts when directory is empty', () => {
            const homeDir = createTempDir();
            const cwd = createTempDir();
            mockedHomedir.mockReturnValue(homeDir);

            const result = countEnvironment(cwd);

            expect(result.claudeMdCount).toBe(0);
            expect(result.rulesCount).toBe(0);
            expect(result.mcpCount).toBe(0);
            expect(result.hooksCount).toBe(0);
        });
    });

    describe('CLAUDE_CONFIG_DIR override', () => {
        it('uses CLAUDE_CONFIG_DIR instead of ~/.claude when set', () => {
            const homeDir = createTempDir();
            const customConfigDir = createTempDir();
            const cwd = createTempDir();
            mockedHomedir.mockReturnValue(homeDir);

            // Put CLAUDE.md in the override dir, NOT in ~/.claude
            writeFile(path.join(customConfigDir, 'CLAUDE.md'), '# Custom');
            writeFile(path.join(customConfigDir, 'rules', 'custom-rule.md'), '# Custom rule');

            process.env.CLAUDE_CONFIG_DIR = customConfigDir;

            const result = countEnvironment(cwd);

            expect(result.claudeMdCount).toBe(1);  // from custom config dir
            expect(result.rulesCount).toBe(1);      // from custom config dir
        });
    });

    describe('project scope overlap detection', () => {
        it('does not double-count when cwd/.claude points to same dir as user claude dir', () => {
            const homeDir = createTempDir();
            mockedHomedir.mockReturnValue(homeDir);

            const claudeDir = path.join(homeDir, '.claude');

            // Create CLAUDE.md and rules in ~/.claude
            writeFile(path.join(claudeDir, 'CLAUDE.md'), '# User CLAUDE.md');
            writeFile(path.join(claudeDir, 'rules', 'shared-rule.md'), '# Shared');

            writeJson(path.join(claudeDir, 'settings.json'), {
                mcpServers: { sharedServer: {} },
                hooks: { preCommit: {} }
            });

            // Use homeDir as cwd so cwd/.claude === ~/.claude
            const result = countEnvironment(homeDir);

            // ~/.claude/CLAUDE.md counted once (user scope), not again as project scope
            expect(result.claudeMdCount).toBe(1);
            expect(result.rulesCount).toBe(1);
            expect(result.mcpCount).toBe(1);
            expect(result.hooksCount).toBe(1);
        });
    });
});