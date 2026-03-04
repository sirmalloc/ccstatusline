import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import {
    CCSTATUSLINE_COMMANDS,
    getClaudeSettingsPath,
    installStatusLine,
    isKnownCommand
} from '../claude-settings';
import { initConfigPath } from '../config';

const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
let testClaudeConfigDir = '';

function readInstalledCommand(): string {
    const settingsPath = getClaudeSettingsPath();
    const content = fs.readFileSync(settingsPath, 'utf-8');
    const data = JSON.parse(content) as { statusLine?: { command?: string } };
    return data.statusLine?.command ?? '';
}

beforeEach(() => {
    testClaudeConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-claude-settings-'));
    process.env.CLAUDE_CONFIG_DIR = testClaudeConfigDir;
    initConfigPath();
});

afterEach(() => {
    initConfigPath();
    if (testClaudeConfigDir) {
        fs.rmSync(testClaudeConfigDir, { recursive: true, force: true });
    }
});

afterAll(() => {
    if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
    } else {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
    }
});

describe('isKnownCommand', () => {
    it('should match exact NPM command', () => {
        expect(isKnownCommand(CCSTATUSLINE_COMMANDS.NPM)).toBe(true);
    });

    it('should match exact BUNX command', () => {
        expect(isKnownCommand(CCSTATUSLINE_COMMANDS.BUNX)).toBe(true);
    });

    it('should match exact SELF_MANAGED command', () => {
        expect(isKnownCommand(CCSTATUSLINE_COMMANDS.SELF_MANAGED)).toBe(true);
    });

    it('should match NPM command with --config and simple path', () => {
        expect(isKnownCommand(`${CCSTATUSLINE_COMMANDS.NPM} --config /tmp/settings.json`)).toBe(true);
    });

    it('should match BUNX command with --config and quoted path with spaces', () => {
        expect(isKnownCommand(`${CCSTATUSLINE_COMMANDS.BUNX} --config '/my path/settings.json'`)).toBe(true);
    });

    it('should match command with --config and quoted path with parens', () => {
        expect(isKnownCommand(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my(path)/settings.json'`)).toBe(true);
    });

    it('should match command with --config and double-quoted Windows path', () => {
        expect(isKnownCommand(`${CCSTATUSLINE_COMMANDS.NPM} --config "C:\\Users\\Alice\\My Settings\\settings.json"`)).toBe(true);
    });

    it('should not match unknown commands', () => {
        expect(isKnownCommand('some-other-command')).toBe(false);
    });

    it('should not match empty string', () => {
        expect(isKnownCommand('')).toBe(false);
    });

    it('should not match partial prefix', () => {
        expect(isKnownCommand('npx -y ccstatusline')).toBe(false);
    });

    it('should not match prefix that is a substring', () => {
        expect(isKnownCommand('npx -y ccstatusline@latestFOO')).toBe(false);
    });
});

describe('buildCommand via installStatusLine', () => {
    it('should use base command when no custom config path', async () => {
        initConfigPath();
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(CCSTATUSLINE_COMMANDS.NPM);
    });

    it('should append --config with simple path (no quoting needed)', async () => {
        initConfigPath('/tmp/settings.json');
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config /tmp/settings.json`);
    });

    it('should quote path with spaces', async () => {
        initConfigPath('/my path/settings.json');
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my path/settings.json'`);
    });

    it('should quote path with parentheses', async () => {
        initConfigPath('/my(path)/settings.json');
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my(path)/settings.json'`);
    });

    it('should escape embedded single quotes in path', async () => {
        initConfigPath('/my\'path/settings.json');
        await installStatusLine(false);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my'\\''path/settings.json'`);
    });

    it('should use bunx command when useBunx is true', async () => {
        initConfigPath('/my path/settings.json');
        await installStatusLine(true);
        expect(readInstalledCommand()).toBe(`${CCSTATUSLINE_COMMANDS.BUNX} --config '/my path/settings.json'`);
    });
});