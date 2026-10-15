import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import type { RenderInvocation } from '../../types/RenderContext';
import type { Settings } from '../../types/Settings';
import { DEFAULT_SETTINGS } from '../../types/Settings';
import type { LoadedSettings } from '../../utils/config';
import type {
    DaemonDependencies,
    DaemonServerHandle
} from '../server';
import { createDaemonServer } from '../server';

// Shared hermetic wiring for daemon transport tests: fixed settings, no
// terminal probe, and a runtime dir under the OS temp dir selected through
// the CCSTATUSLINE_RUNTIME_DIR seam.

export const MODEL_ONLY_SETTINGS: Settings = {
    ...DEFAULT_SETTINGS,
    lines: [[{ id: 'model', type: 'model' }]]
};

export function makeTempRuntimeDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ccsd-'));
}

export interface HermeticDependencies extends DaemonDependencies { invocations: RenderInvocation[] }

export function hermeticDependencies(overrides: Partial<DaemonDependencies> = {}): HermeticDependencies {
    const invocations: RenderInvocation[] = [];
    const loadSettings = (): Promise<LoadedSettings> => Promise.resolve({
        settings: { ...MODEL_ONLY_SETTINGS },
        loadError: null
    });
    return {
        loadSettings,
        resolveTerminalWidth: (_sessionId, _ttlSeconds, env) => {
            // Honor the request env the way the production dependency does:
            // an explicit override wins, otherwise a fixed width.
            if (env.CCSTATUSLINE_WIDTH !== undefined) {
                return Number.parseInt(env.CCSTATUSLINE_WIDTH, 10) || 120;
            }
            return 120;
        },
        buildInvocation: (context, terminalWidth, env) => {
            const invocation: RenderInvocation = {
                configPath: '/tmp/hermetic-settings.json',
                cwd: context.cwd ?? '/tmp',
                env,
                terminalWidth
            };
            invocations.push(invocation);
            return invocation;
        },
        ...overrides,
        invocations
    };
}

export interface StartedTestDaemon {
    daemon: DaemonServerHandle;
    dependencies: HermeticDependencies;
    runtimeDir: string;
    previousRuntimeDir: string | undefined;
}

export async function startTestDaemon(
    overrides: Partial<DaemonDependencies> = {},
    options: { maxInFlightRenders?: number; idleStopMs?: number; onIdleStop?: () => void } = {}
): Promise<StartedTestDaemon> {
    const runtimeDir = makeTempRuntimeDir();
    const previousRuntimeDir = process.env.CCSTATUSLINE_RUNTIME_DIR;
    process.env.CCSTATUSLINE_RUNTIME_DIR = runtimeDir;
    const dependencies = hermeticDependencies(overrides);
    const daemon = createDaemonServer({
        dependencies,
        ...(options.maxInFlightRenders === undefined ? {} : { maxInFlightRenders: options.maxInFlightRenders }),
        ...(options.idleStopMs === undefined ? {} : { idleStopMs: options.idleStopMs }),
        ...(options.onIdleStop === undefined ? {} : { onIdleStop: options.onIdleStop })
    });
    await daemon.start();
    return { daemon, dependencies, runtimeDir, previousRuntimeDir };
}

export async function stopTestDaemon(started: StartedTestDaemon): Promise<void> {
    await started.daemon.stop();
    if (started.previousRuntimeDir === undefined) {
        delete process.env.CCSTATUSLINE_RUNTIME_DIR;
    } else {
        process.env.CCSTATUSLINE_RUNTIME_DIR = started.previousRuntimeDir;
    }
    fs.rmSync(started.runtimeDir, { recursive: true, force: true });
}

export interface DaemonResponse {
    status: number;
    headers: http.IncomingHttpHeaders;
    text: string;
}

export function daemonRequest(
    daemon: DaemonServerHandle,
    options: {
        method: string;
        requestPath: string;
        body?: string;
        token?: string;
        headers?: Record<string, string>;
    }
): Promise<DaemonResponse> {
    const headers: Record<string, string> = {};
    if (options.token !== undefined) {
        headers.authorization = `Bearer ${options.token}`;
    }
    Object.assign(headers, options.headers ?? {});
    return new Promise((resolve, reject) => {
        const request = http.request(
            {
                socketPath: daemon.socketPath,
                method: options.method,
                path: options.requestPath,
                headers
            },
            (response) => {
                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => {
                    resolve({
                        status: response.statusCode ?? 0,
                        headers: response.headers,
                        text: Buffer.concat(chunks).toString('utf8')
                    });
                });
            }
        );
        request.on('error', reject);
        if (options.body !== undefined) {
            request.write(options.body);
        }
        request.end();
    });
}

const RENDER_BODY = JSON.stringify({ model: { id: 'claude-daemon-test' }, cwd: '/tmp' });

export function renderRequest(daemon: DaemonServerHandle, token: string, body: string = RENDER_BODY): Promise<DaemonResponse> {
    return daemonRequest(daemon, { method: 'POST', requestPath: '/v1/render', body, token });
}

/** Poll until the condition holds; bounded so a broken server fails the test. */
export async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error('condition not met within timeout');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}
