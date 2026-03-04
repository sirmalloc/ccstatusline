import {
    afterEach,
    afterAll,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock
} from 'vitest';

import {
    getConfigPath,
    isCustomConfigPath
} from '../config';

vi.mock('../config', () => ({
    getConfigPath: vi.fn(() => '/default/settings.json'),
    isCustomConfigPath: vi.fn(() => false)
}));

const mockIsCustomConfigPath = isCustomConfigPath as Mock;
const mockGetConfigPath = getConfigPath as Mock;
const ORIGINAL_PLATFORM = process.platform;

function setProcessPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', {
        value: platform,
        configurable: true
    });
}

// Safety net: point CLAUDE_CONFIG_DIR at a temp path so even if the fs mock
// leaks, writes will never land in the user's real ~/.claude directory.
const ORIGINAL_CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;

beforeAll(() => {
    process.env.CLAUDE_CONFIG_DIR = '/tmp/ccstatusline-test-fake-claude-config';
});

afterAll(() => {
    if (ORIGINAL_CLAUDE_CONFIG_DIR === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
    } else {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_CLAUDE_CONFIG_DIR;
    }
});

// Capture settings written by installStatusLine via the mock writeFile callback.
let savedSettings: Record<string, unknown> = {};

vi.mock('fs', () => ({
    existsSync: vi.fn(() => false),
    statSync: vi.fn(),
    promises: {
        readFile: vi.fn(() => Promise.resolve('{}')),
        writeFile: vi.fn((_path: string, content: string) => {
            savedSettings = JSON.parse(content) as Record<string, unknown>;
            return Promise.resolve(undefined);
        }),
        mkdir: vi.fn(() => Promise.resolve(undefined))
    }
}));

// Dynamic import so the module picks up the mocked fs references.
const { CCSTATUSLINE_COMMANDS, isKnownCommand, installStatusLine } = await import('../claude-settings');

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
    beforeEach(() => {
        savedSettings = {};
        setProcessPlatform(ORIGINAL_PLATFORM);
        mockIsCustomConfigPath.mockReturnValue(false);
        mockGetConfigPath.mockReturnValue('/default/settings.json');
    });

    afterEach(() => {
        setProcessPlatform(ORIGINAL_PLATFORM);
    });

    it('should use base command when no custom config path', async () => {
        mockIsCustomConfigPath.mockReturnValue(false);
        await installStatusLine(false);

        const statusLine = savedSettings.statusLine as { command: string };
        expect(statusLine.command).toBe(CCSTATUSLINE_COMMANDS.NPM);
    });

    it('should append --config with simple path (no quoting needed)', async () => {
        mockIsCustomConfigPath.mockReturnValue(true);
        mockGetConfigPath.mockReturnValue('/tmp/settings.json');
        await installStatusLine(false);

        const statusLine = savedSettings.statusLine as { command: string };
        expect(statusLine.command).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config /tmp/settings.json`);
    });

    it('should quote path with spaces', async () => {
        mockIsCustomConfigPath.mockReturnValue(true);
        mockGetConfigPath.mockReturnValue('/my path/settings.json');
        await installStatusLine(false);

        const statusLine = savedSettings.statusLine as { command: string };
        expect(statusLine.command).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my path/settings.json'`);
    });

    it('should quote path with parentheses', async () => {
        mockIsCustomConfigPath.mockReturnValue(true);
        mockGetConfigPath.mockReturnValue('/my(path)/settings.json');
        await installStatusLine(false);

        const statusLine = savedSettings.statusLine as { command: string };
        expect(statusLine.command).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my(path)/settings.json'`);
    });

    it('should escape embedded single quotes in path', async () => {
        mockIsCustomConfigPath.mockReturnValue(true);
        mockGetConfigPath.mockReturnValue('/my\'path/settings.json');
        await installStatusLine(false);

        const statusLine = savedSettings.statusLine as { command: string };
        expect(statusLine.command).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config '/my'\\''path/settings.json'`);
    });

    it('should use bunx command when useBunx is true', async () => {
        mockIsCustomConfigPath.mockReturnValue(true);
        mockGetConfigPath.mockReturnValue('/my path/settings.json');
        await installStatusLine(true);

        const statusLine = savedSettings.statusLine as { command: string };
        expect(statusLine.command).toBe(`${CCSTATUSLINE_COMMANDS.BUNX} --config '/my path/settings.json'`);
    });

    it('should use Windows-safe double quoting for custom config paths', async () => {
        setProcessPlatform('win32');
        mockIsCustomConfigPath.mockReturnValue(true);
        mockGetConfigPath.mockReturnValue('C:\\Users\\Alice\\My Settings\\settings.json');
        await installStatusLine(false);

        const statusLine = savedSettings.statusLine as { command: string };
        expect(statusLine.command).toBe(`${CCSTATUSLINE_COMMANDS.NPM} --config \"C:\\Users\\Alice\\My Settings\\settings.json\"`);
    });
});
