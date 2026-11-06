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

export interface RefusingProxy {
    url: string;
    // How many connections reached the proxy so far
    connectionCount: () => number;
    stop: () => Promise<void>;
}

// A local proxy that drops every connection as soon as it arrives
export async function startRefusingProxy(): Promise<RefusingProxy> {
    let connections = 0;
    const server = net.createServer((socket) => {
        connections += 1;
        socket.on('error', () => undefined);
        socket.destroy();
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as net.AddressInfo;

    return {
        url: `http://127.0.0.1:${port}`,
        connectionCount: () => connections,
        stop: () => new Promise<void>((resolve) => {
            server.close(() => {
                resolve();
            });
        })
    };
}

export interface AnsweringProxy {
    url: string;
    stop: () => Promise<void>;
}

// A local proxy that answers every CONNECT with `statusCode` and closes the
// connection, as a proxy does when it won't open the tunnel
export async function startAnsweringProxy(statusCode: number): Promise<AnsweringProxy> {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
        sockets.add(socket);
        let received = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            const answered = received.includes('\r\n\r\n');
            received += chunk;
            // Answers once the CONNECT's headers are in
            if (!answered && received.includes('\r\n\r\n')) {
                socket.end(`HTTP/1.1 ${statusCode} Refused\r\ncontent-length: 0\r\nconnection: close\r\n\r\n`);
            }
        });
        socket.on('error', () => undefined);
        socket.on('close', () => {
            sockets.delete(socket);
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as net.AddressInfo;

    return {
        url: `http://127.0.0.1:${port}`,
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

export interface TunnelingProxy {
    url: string;
    // How many CONNECT tunnels the proxy opened so far
    tunnelCount: () => number;
    stop: () => Promise<void>;
}

// A local proxy that opens every CONNECT tunnel to `targetPort` on this
// machine, whatever host the CONNECT names, as a proxy in front of a local
// stand-in for the API
export async function startTunnelingProxy(targetPort: number): Promise<TunnelingProxy> {
    let tunnels = 0;
    const sockets = new Set<net.Socket>();
    const track = (socket: net.Socket) => {
        sockets.add(socket);
        socket.on('error', () => undefined);
        socket.on('close', () => {
            sockets.delete(socket);
        });
    };
    const server = net.createServer((client) => {
        track(client);
        let received = Buffer.alloc(0);
        const onData = (chunk: Buffer) => {
            received = Buffer.concat([received, chunk]);
            const headersEnd = received.indexOf('\r\n\r\n');
            if (headersEnd === -1) {
                return;
            }
            client.off('data', onData);
            tunnels += 1;
            const upstream = net.connect(targetPort, '127.0.0.1', () => {
                client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
                upstream.write(received.subarray(headersEnd + 4));
                client.pipe(upstream);
                upstream.pipe(client);
            });
            track(upstream);
            upstream.on('close', () => client.destroy());
            client.on('close', () => upstream.destroy());
        };
        client.on('data', onData);
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as net.AddressInfo;

    return {
        url: `http://127.0.0.1:${port}`,
        tunnelCount: () => tunnels,
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
