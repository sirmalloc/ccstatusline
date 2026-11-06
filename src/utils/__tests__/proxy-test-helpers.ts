import * as net from 'node:net';
import {
    afterEach,
    beforeEach
} from 'vitest';

export interface StalledProxy {
    url: string;
    // Resolves once a connection that reached the proxy closes
    connectionClosed: Promise<void>;
    stop: () => Promise<void>;
}

// A local proxy that accepts connections and never answers CONNECT
export async function startStalledProxy(): Promise<StalledProxy> {
    let markClosed = (): void => undefined;
    const connectionClosed = new Promise<void>((resolve) => {
        markClosed = resolve;
    });
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
        sockets.add(socket);
        // Drops the CONNECT unanswered; a paused socket would never see the client close
        socket.resume();
        socket.on('error', () => undefined);
        socket.on('close', () => {
            sockets.delete(socket);
            markClosed();
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as net.AddressInfo;

    return {
        url: `http://127.0.0.1:${port}`,
        connectionClosed,
        stop: () => new Promise<void>((resolve) => {
            for (const socket of sockets) {
                socket.destroy();
            }
            server.close(() => {
                resolve();
            });
        })
    };
}

// Tests set HTTPS_PROXY and NO_PROXY themselves; the environment running the
// suite must not leak in.
export function isolateHttpsProxyEnv(): void {
    let originalProxy: string | undefined;
    let originalNoProxy: string | undefined;
    let originalLowercaseNoProxy: string | undefined;

    beforeEach(() => {
        originalProxy = process.env.HTTPS_PROXY;
        originalNoProxy = process.env.NO_PROXY;
        originalLowercaseNoProxy = process.env.no_proxy;
        delete process.env.HTTPS_PROXY;
        delete process.env.NO_PROXY;
        delete process.env.no_proxy;
    });

    afterEach(() => {
        restoreEnv('HTTPS_PROXY', originalProxy);
        restoreEnv('NO_PROXY', originalNoProxy);
        restoreEnv('no_proxy', originalLowercaseNoProxy);
    });
}

function restoreEnv(name: 'HTTPS_PROXY' | 'NO_PROXY' | 'no_proxy', value: string | undefined): void {
    if (value === undefined) {
        Reflect.deleteProperty(process.env, name);
    } else {
        process.env[name] = value;
    }
}
