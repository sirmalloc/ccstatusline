import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import { countEnvironment } from '../environment-counter';

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
    });

    afterEach(() => {
        if (savedConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
        }
    });

    it('counts CLAUDE.md files and rules via CLAUDE_CONFIG_DIR', () => {
        const configDir = createTempDir();
        const cwd = createTempDir();
        process.env.CLAUDE_CONFIG_DIR = configDir;

        writeFile(path.join(configDir, 'CLAUDE.md'), '# User');
        writeFile(path.join(configDir, 'rules', 'rule1.md'), '# Rule 1');
        writeFile(path.join(configDir, 'rules', 'rule2.md'), '# Rule 2');
        writeFile(path.join(cwd, 'CLAUDE.md'), '# Project');

        const result = countEnvironment(cwd);

        expect(result.claudeMdCount).toBe(2);
        expect(result.rulesCount).toBe(2);
    });

    it('counts hooks from settings.json', () => {
        const configDir = createTempDir();
        const cwd = createTempDir();
        process.env.CLAUDE_CONFIG_DIR = configDir;

        writeJson(path.join(configDir, 'settings.json'), { hooks: { preCommit: {}, postCommit: {}, lint: {} } });

        const result = countEnvironment(cwd);

        expect(result.hooksCount).toBe(3);
    });

    it('counts MCP servers from settings.json', () => {
        const configDir = createTempDir();
        const cwd = createTempDir();
        process.env.CLAUDE_CONFIG_DIR = configDir;

        writeJson(path.join(configDir, 'settings.json'), { mcpServers: { server1: {}, server2: {} } });

        const result = countEnvironment(cwd);

        // MCP count includes servers from configDir settings + any from real homedir
        // Just verify our servers are counted
        expect(result.mcpCount).toBeGreaterThanOrEqual(2);
    });

    it('uses CLAUDE_CONFIG_DIR for config lookups', () => {
        const customConfigDir = createTempDir();
        const cwd = createTempDir();
        process.env.CLAUDE_CONFIG_DIR = customConfigDir;

        writeFile(path.join(customConfigDir, 'CLAUDE.md'), '# Custom');
        writeFile(path.join(customConfigDir, 'rules', 'custom-rule.md'), '# Custom rule');

        const result = countEnvironment(cwd);

        expect(result.claudeMdCount).toBe(1);
        expect(result.rulesCount).toBe(1);
    });

    it('returns an object with all four count fields', () => {
        const configDir = createTempDir();
        const cwd = createTempDir();
        process.env.CLAUDE_CONFIG_DIR = configDir;

        const result = countEnvironment(cwd);

        expect(result).toHaveProperty('claudeMdCount');
        expect(result).toHaveProperty('rulesCount');
        expect(result).toHaveProperty('mcpCount');
        expect(result).toHaveProperty('hooksCount');
    });
});