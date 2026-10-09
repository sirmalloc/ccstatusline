import * as path from 'node:path';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it
} from 'vitest';

import type { RenderUsageData } from '../../types/RenderContext';
import type { WidgetItem } from '../../types/Widget';
import { computeSessionForecastIfNeeded } from '../session-forecast-prefetch';
import type { SessionUsageHistoryDeps } from '../session-usage-history';

const CACHE_PATH = '/cache/ccstatusline/session-usage-history.json';
const NOW = Date.UTC(2026, 9, 8, 13, 17);
const RESET_AT = Date.UTC(2026, 9, 8, 15, 0);
const PROFILE = '/profiles/personal';

function at(hours: number, minutes: number): number {
    return Date.UTC(2026, 9, 8, hours, minutes);
}

function makeDeps(initial?: unknown): SessionUsageHistoryDeps & { files: Map<string, string>; reads: number } {
    const files = new Map<string, string>();
    if (initial !== undefined) {
        files.set(CACHE_PATH, JSON.stringify(initial));
    }

    const deps = {
        files,
        reads: 0,
        cachePath: CACHE_PATH,
        now: () => NOW,
        mkdirSync: () => undefined,
        readFileSync: (p: string) => {
            deps.reads += 1;
            const content = files.get(p);
            if (content === undefined) {
                throw new Error('ENOENT');
            }

            return content;
        },
        writeFileSync: (p: string, data: string) => { files.set(p, data); },
        renameSync: (from: string, to: string) => {
            files.set(to, files.get(from) ?? '');
            files.delete(from);
        }
    };
    return deps;
}

function storedProfiles(deps: ReturnType<typeof makeDeps>): string[] {
    const parsed = JSON.parse(deps.files.get(CACHE_PATH) ?? '{"profiles":{}}') as { profiles: Record<string, unknown> };
    return Object.keys(parsed.profiles);
}

const usageData: RenderUsageData = { sessionUsage: 42, sessionResetAt: new Date(RESET_AT).toISOString() };

describe('computeSessionForecastIfNeeded', () => {
    let savedConfigDir: string | undefined;

    beforeEach(() => {
        savedConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = PROFILE;
    });

    afterEach(() => {
        if (savedConfigDir === undefined) {
            delete process.env.CLAUDE_CONFIG_DIR;
        } else {
            process.env.CLAUDE_CONFIG_DIR = savedConfigDir;
        }
    });

    it('does nothing without a forecast widget on any line', () => {
        const deps = makeDeps();

        expect(computeSessionForecastIfNeeded([[{ id: '1', type: 'session-usage' }]], usageData, deps)).toBeNull();
        expect(deps.reads).toBe(0);
    });

    it.each(['block-forecast', 'block-limit-timer'])('records and forecasts for %s', (type) => {
        const deps = makeDeps({
            version: 1,
            profiles: { [path.resolve(PROFILE)]: [{ resetAt: RESET_AT, readings: [[at(12, 20), at(12, 52), 30], [at(12, 53), at(13, 16), 42]] }] }
        });
        const lines: WidgetItem[][] = [[{ id: '1', type }]];

        const forecast = computeSessionForecastIfNeeded(lines, usageData, deps);

        expect(forecast?.projectedPercent).toBeCloseTo(83.2, 6);
        expect(forecast?.limitInMs).toBeNull();
    });

    it('files readings under the Claude config directory', () => {
        const deps = makeDeps();

        computeSessionForecastIfNeeded([[{ id: '1', type: 'block-forecast' }]], usageData, deps);

        expect(storedProfiles(deps)).toEqual([path.resolve(PROFILE)]);
    });

    it('shares one history whether or not the config directory has a trailing slash', () => {
        const deps = makeDeps();
        const lines: WidgetItem[][] = [[{ id: '1', type: 'block-forecast' }]];

        process.env.CLAUDE_CONFIG_DIR = `${PROFILE}/`;
        computeSessionForecastIfNeeded(lines, usageData, deps);
        process.env.CLAUDE_CONFIG_DIR = PROFILE;
        computeSessionForecastIfNeeded(lines, { ...usageData, sessionUsage: 43 }, deps);

        expect(storedProfiles(deps)).toEqual([path.resolve(PROFILE)]);
    });

    it.each([
        ['no session percent', { sessionResetAt: new Date(RESET_AT).toISOString() }],
        ['no reset time', { sessionUsage: 42 }],
        ['an unparsable reset time', { sessionUsage: 42, sessionResetAt: 'soon' }],
        ['a reset time already passed', { sessionUsage: 42, sessionResetAt: new Date(NOW).toISOString() }],
        ['no usage data', null]
    ])('does nothing with %s', (_label, data: RenderUsageData | null) => {
        const deps = makeDeps();

        expect(computeSessionForecastIfNeeded([[{ id: '1', type: 'block-forecast' }]], data, deps)).toBeNull();
        expect(deps.reads).toBe(0);
    });

    it('clamps a session percent over 100 and has nothing to forecast', () => {
        const deps = makeDeps();

        expect(computeSessionForecastIfNeeded([[{ id: '1', type: 'block-forecast' }]], { ...usageData, sessionUsage: 104 }, deps)).toBeNull();
        expect(deps.files.get(CACHE_PATH)).toContain(`[${NOW},${NOW},100]`);
    });
});
