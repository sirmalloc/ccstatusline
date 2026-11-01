import * as net from 'node:net';

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
