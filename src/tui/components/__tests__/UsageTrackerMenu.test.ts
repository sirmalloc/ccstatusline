import { render } from 'ink';
import { PassThrough } from 'node:stream';
import React from 'react';
import {
    describe,
    expect,
    it,
    vi
} from 'vitest';

import {
    SettingsSchema,
    type Settings,
    type UsageTrackerConfig
} from '../../../types/Settings';
import {
    UsageTrackerMenu,
    buildUsageTrackerItems,
    shouldWarnAboutApiPolling,
    validateHeartbeatMinutesInput,
    validateRotateMaxMbInput
} from '../UsageTrackerMenu';

class MockTtyStream extends PassThrough {
    isTTY = true;
    columns = 120;
    rows = 40;

    setRawMode() {
        return this;
    }

    ref() {
        return this;
    }

    unref() {
        return this;
    }
}

interface CapturedWriteStream extends NodeJS.WriteStream { getOutput: () => string }

function createMockStdin(): NodeJS.ReadStream {
    return new MockTtyStream() as unknown as NodeJS.ReadStream;
}

function createMockStdout(): CapturedWriteStream {
    const stream = new MockTtyStream();
    const chunks: string[] = [];

    stream.on('data', (chunk: Buffer | string) => {
        chunks.push(chunk.toString());
    });

    return Object.assign(stream as unknown as NodeJS.WriteStream, {
        getOutput() {
            return chunks.join('');
        }
    });
}

function flushInk() {
    return new Promise((resolve) => {
        setTimeout(resolve, 25);
    });
}

const BASE_CONFIG: UsageTrackerConfig = {
    enabled: true,
    logApiUsage: true,
    heartbeatMinutes: 10,
    rotateMaxMb: 5
};

const USAGE_LINES: Settings['lines'] = [[{ id: '1', type: 'session-usage' }]];
const PLAIN_LINES: Settings['lines'] = [[{ id: '1', type: 'model' }]];

describe('validateHeartbeatMinutesInput', () => {
    it('should accept valid values within range', () => {
        expect(validateHeartbeatMinutesInput('1')).toBeNull();
        expect(validateHeartbeatMinutesInput('10')).toBeNull();
        expect(validateHeartbeatMinutesInput('120')).toBeNull();
    });

    it('should reject values outside the range', () => {
        expect(validateHeartbeatMinutesInput('0')).toContain('Minimum');
        expect(validateHeartbeatMinutesInput('121')).toContain('Maximum');
    });

    it('should reject empty and non-numeric input', () => {
        expect(validateHeartbeatMinutesInput('')).toContain('valid number');
        expect(validateHeartbeatMinutesInput('abc')).toContain('valid number');
    });
});

describe('validateRotateMaxMbInput', () => {
    it('should accept valid values within range', () => {
        expect(validateRotateMaxMbInput('1')).toBeNull();
        expect(validateRotateMaxMbInput('5')).toBeNull();
        expect(validateRotateMaxMbInput('100')).toBeNull();
    });

    it('should reject values outside the range', () => {
        expect(validateRotateMaxMbInput('0')).toContain('Minimum');
        expect(validateRotateMaxMbInput('101')).toContain('Maximum');
    });

    it('should reject empty and non-numeric input', () => {
        expect(validateRotateMaxMbInput('')).toContain('valid number');
        expect(validateRotateMaxMbInput('abc')).toContain('valid number');
    });
});

describe('buildUsageTrackerItems', () => {
    it('shows the current values as sublabels', () => {
        const items = buildUsageTrackerItems(BASE_CONFIG);

        expect(items).toHaveLength(4);
        expect(items[0]).toMatchObject({ value: 'enabled', sublabel: '(enabled)' });
        expect(items[1]).toMatchObject({ value: 'logApiUsage', sublabel: '(on)' });
        expect(items[2]?.sublabel).toBe('(10 min)');
        expect(items[3]?.sublabel).toBe('(5 MB)');
    });

    it('disables the dependent options while tracking is off', () => {
        const items = buildUsageTrackerItems({
            ...BASE_CONFIG,
            enabled: false,
            logApiUsage: false
        });

        expect(items[0]?.sublabel).toBe('(disabled)');
        expect(items[0]?.disabled).toBeFalsy();
        expect(items[1]).toMatchObject({ sublabel: '(off)', disabled: true });
        expect(items[2]?.disabled).toBe(true);
        expect(items[3]?.disabled).toBe(true);
    });
});

describe('shouldWarnAboutApiPolling', () => {
    it('warns when API logging would poll for a user with no usage widgets', () => {
        expect(shouldWarnAboutApiPolling(BASE_CONFIG, PLAIN_LINES)).toBe(true);
    });

    it('stays quiet when a usage widget already causes the polling', () => {
        expect(shouldWarnAboutApiPolling(BASE_CONFIG, USAGE_LINES)).toBe(false);
    });

    it('stays quiet when no API request can happen', () => {
        expect(shouldWarnAboutApiPolling({ ...BASE_CONFIG, logApiUsage: false }, PLAIN_LINES)).toBe(false);
        expect(shouldWarnAboutApiPolling({ ...BASE_CONFIG, enabled: false }, PLAIN_LINES)).toBe(false);
    });
});

describe('UsageTrackerMenu', () => {
    it('shows the resolved log path, the API polling disclosure, and toggles tracking', async () => {
        const stdin = createMockStdin();
        const stdout = createMockStdout();
        const stderr = createMockStdout();
        const onUpdate = vi.fn();
        const settings = SettingsSchema.parse({
            lines: PLAIN_LINES,
            usageTracker: BASE_CONFIG
        });
        const instance = render(
            React.createElement(UsageTrackerMenu, {
                settings,
                onUpdate,
                onBack: vi.fn()
            }),
            {
                stdin,
                stdout,
                stderr,
                debug: true,
                exitOnCtrlC: false,
                patchConsole: false
            }
        );

        try {
            await flushInk();

            expect(stdout.getOutput()).toContain('usage-log.jsonl');
            expect(stdout.getOutput()).toContain('No usage widgets are configured');

            stdin.write('\r');
            await flushInk();

            const updated = onUpdate.mock.calls[0]?.[0] as Settings | undefined;
            expect(updated?.usageTracker).toMatchObject({
                enabled: false,
                logApiUsage: true
            });
        } finally {
            instance.unmount();
            instance.cleanup();
            stdin.destroy();
            stdout.destroy();
            stderr.destroy();
        }
    });
});
