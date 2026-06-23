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

import { getCompactionOverrides } from '../claude-compaction';

// Capture original env values up-front so afterAll can restore them whether
// or not the test that mutated them ran successfully.
const ORIGINAL_ENV = {
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW,
    CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE,
    DISABLE_AUTO_COMPACT: process.env.DISABLE_AUTO_COMPACT,
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR
};

function clearEnv(): void {
    delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
    delete process.env.DISABLE_AUTO_COMPACT;
    delete process.env.CLAUDE_CONFIG_DIR;
}

function restoreEnv(): void {
    if (ORIGINAL_ENV.CLAUDE_CODE_AUTO_COMPACT_WINDOW === undefined) {
        delete process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    } else {
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = ORIGINAL_ENV.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    }
    if (ORIGINAL_ENV.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE === undefined) {
        delete process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
    } else {
        process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = ORIGINAL_ENV.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE;
    }
    if (ORIGINAL_ENV.DISABLE_AUTO_COMPACT === undefined) {
        delete process.env.DISABLE_AUTO_COMPACT;
    } else {
        process.env.DISABLE_AUTO_COMPACT = ORIGINAL_ENV.DISABLE_AUTO_COMPACT;
    }
    if (ORIGINAL_ENV.CLAUDE_CONFIG_DIR === undefined) {
        delete process.env.CLAUDE_CONFIG_DIR;
    } else {
        process.env.CLAUDE_CONFIG_DIR = ORIGINAL_ENV.CLAUDE_CONFIG_DIR;
    }
}

let testUserDir = '';
let testProjectDir = '';

function writeUserSettings(content: unknown, file = 'settings.json'): void {
    const settingsPath = path.join(testUserDir, file);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
        settingsPath,
        typeof content === 'string' ? content : JSON.stringify(content),
        'utf-8'
    );
}

function writeProjectSettings(content: unknown, file = 'settings.json'): void {
    const settingsPath = path.join(testProjectDir, '.claude', file);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(
        settingsPath,
        typeof content === 'string' ? content : JSON.stringify(content),
        'utf-8'
    );
}

beforeEach(() => {
    clearEnv();
    testUserDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-compaction-user-'));
    testProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ccstatusline-compaction-project-'));
    process.env.CLAUDE_CONFIG_DIR = testUserDir;
});

afterEach(() => {
    if (testUserDir) {
        fs.rmSync(testUserDir, { recursive: true, force: true });
    }
    if (testProjectDir) {
        fs.rmSync(testProjectDir, { recursive: true, force: true });
    }
    clearEnv();
});

afterAll(() => {
    restoreEnv();
});

describe('getCompactionOverrides', () => {
    describe('with no env vars and no settings files', () => {
        it('returns null for both fields', () => {
            expect(getCompactionOverrides(testProjectDir)).toEqual({
                effectiveWindow: null,
                ratio: null
            });
        });
    });

    describe('effectiveWindow resolution', () => {
        it('reads CLAUDE_CODE_AUTO_COMPACT_WINDOW from env', () => {
            process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '300000';
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBe(300000);
        });

        it('reads autoCompactWindow from user settings.json', () => {
            writeUserSettings({ autoCompactWindow: 200000 });
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBe(200000);
        });

        it('reads autoCompactWindow from project settings.json', () => {
            writeProjectSettings({ autoCompactWindow: 150000 });
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBe(150000);
        });

        it('prefers env var over settings.json', () => {
            process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '50000';
            writeUserSettings({ autoCompactWindow: 999999 });
            writeProjectSettings({ autoCompactWindow: 999999 });
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBe(50000);
        });

        it('prefers project settings over user settings', () => {
            writeUserSettings({ autoCompactWindow: 999999 });
            writeProjectSettings({ autoCompactWindow: 100000 });
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBe(100000);
        });

        it('prefers project .local over project base', () => {
            writeProjectSettings({ autoCompactWindow: 999999 }, 'settings.json');
            writeProjectSettings({ autoCompactWindow: 75000 }, 'settings.local.json');
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBe(75000);
        });

        it('ignores non-numeric or non-positive autoCompactWindow', () => {
            writeUserSettings({ autoCompactWindow: 'lots' });
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBeNull();

            writeUserSettings({ autoCompactWindow: 0 });
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBeNull();

            writeUserSettings({ autoCompactWindow: -100 });
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBeNull();
        });

        it('ignores malformed env var (non-numeric, zero, negative)', () => {
            process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = 'huge';
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBeNull();

            process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '0';
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBeNull();

            process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = '-50000';
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBeNull();
        });

        it('tolerates malformed JSON in settings files', () => {
            writeUserSettings('{ not json');
            writeProjectSettings({ autoCompactWindow: 100000 });
            expect(getCompactionOverrides(testProjectDir).effectiveWindow).toBe(100000);
        });
    });

    describe('ratio resolution', () => {
        it('returns 1.0 when DISABLE_AUTO_COMPACT=1', () => {
            process.env.DISABLE_AUTO_COMPACT = '1';
            expect(getCompactionOverrides(testProjectDir).ratio).toBe(1.0);
        });

        it('also accepts DISABLE_AUTO_COMPACT=true (case-insensitive)', () => {
            process.env.DISABLE_AUTO_COMPACT = 'TRUE';
            expect(getCompactionOverrides(testProjectDir).ratio).toBe(1.0);
        });

        it('parses CLAUDE_AUTOCOMPACT_PCT_OVERRIDE as a percentage', () => {
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
            expect(getCompactionOverrides(testProjectDir).ratio).toBeCloseTo(0.6);
        });

        it('prefers DISABLE_AUTO_COMPACT over PCT override when both are set', () => {
            process.env.DISABLE_AUTO_COMPACT = '1';
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
            expect(getCompactionOverrides(testProjectDir).ratio).toBe(1.0);
        });

        it('rejects PCT override outside 1-100', () => {
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '0';
            expect(getCompactionOverrides(testProjectDir).ratio).toBeNull();

            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '101';
            expect(getCompactionOverrides(testProjectDir).ratio).toBeNull();

            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = 'half';
            expect(getCompactionOverrides(testProjectDir).ratio).toBeNull();
        });

        it('ignores DISABLE_AUTO_COMPACT when set to a non-truthy value', () => {
            process.env.DISABLE_AUTO_COMPACT = '0';
            expect(getCompactionOverrides(testProjectDir).ratio).toBeNull();

            process.env.DISABLE_AUTO_COMPACT = 'false';
            expect(getCompactionOverrides(testProjectDir).ratio).toBeNull();
        });
    });

    describe('combined overrides', () => {
        it('returns both effectiveWindow and ratio when both are configured', () => {
            process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = '60';
            writeProjectSettings({ autoCompactWindow: 200000 });
            expect(getCompactionOverrides(testProjectDir)).toEqual({
                effectiveWindow: 200000,
                ratio: 0.6
            });
        });
    });
});
