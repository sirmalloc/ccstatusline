import {
    afterEach,
    describe,
    expect,
    it
} from 'vitest';

import type { LoadedSettings } from '../../utils/config';

import type { StartedTestDaemon } from './test-daemon';
import {
    MODEL_ONLY_SETTINGS,
    renderRequest,
    startTestDaemon,
    stopTestDaemon,
    waitFor
} from './test-daemon';

// Render dedup at the daemon boundary (#18): identical display contexts join
// one in-flight render. Consumer-release cancellation semantics are covered
// deterministically in provider-scope.test.ts (RefreshGroup); the socket-level
// "last client left" wiring cannot be exercised under bun, which never
// surfaces client disconnects to node:http servers (verified against 1.3.13).

interface LoadSettingsGate {
    loadSettings: (configPath: string) => Promise<LoadedSettings>;
    readonly pending: number;
    openAll: () => void;
}

function makeLoadSettingsGate(): LoadSettingsGate {
    const resolvers: (() => void)[] = [];
    return {
        loadSettings: () => new Promise<LoadedSettings>((resolve) => {
            resolvers.push(() => { resolve({ settings: { ...MODEL_ONLY_SETTINGS }, loadError: null }); });
        }),
        get pending() {
            return resolvers.length;
        },
        openAll: () => {
            while (resolvers.length > 0) {
                resolvers.shift()?.();
            }
        }
    };
}

const BODY_A = JSON.stringify({ model: { id: 'claude-dedup-a' }, cwd: '/tmp' });
const BODY_B = JSON.stringify({ model: { id: 'claude-dedup-b' }, cwd: '/tmp' });

describe('daemon render dedup (#18)', () => {
    let started: StartedTestDaemon | undefined;

    afterEach(async () => {
        if (started) {
            await stopTestDaemon(started);
            started = undefined;
        }
    });

    it('joins identical in-flight renders into one job', async () => {
        const gate = makeLoadSettingsGate();
        started = await startTestDaemon({ loadSettings: gate.loadSettings });

        const first = renderRequest(started.daemon, started.daemon.token, BODY_A);
        const second = renderRequest(started.daemon, started.daemon.token, BODY_A);
        await waitFor(() => gate.pending === 1);
        gate.openAll();

        const [firstResponse, secondResponse] = await Promise.all([first, second]);
        expect(firstResponse.status).toBe(200);
        expect(secondResponse.text).toBe(firstResponse.text);
        expect(started.daemon.counters.deduped).toBe(1);
        // One render ran: one invocation snapshot built.
        expect(started.dependencies.invocations).toHaveLength(1);
    });

    it('does not join renders with different payloads', async () => {
        started = await startTestDaemon({});

        const [firstResponse, secondResponse] = await Promise.all([
            renderRequest(started.daemon, started.daemon.token, BODY_A),
            renderRequest(started.daemon, started.daemon.token, BODY_B)
        ]);
        expect(firstResponse.status).toBe(200);
        expect(secondResponse.status).toBe(200);
        expect(started.daemon.counters.deduped ?? 0).toBe(0);
        expect(started.dependencies.invocations).toHaveLength(2);
    });
});
