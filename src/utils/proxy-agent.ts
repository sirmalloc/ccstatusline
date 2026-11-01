import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ClosableProxyAgent {
    agent: HttpsProxyAgent<string>;
    close: () => void;
}

/**
 * An agent that tunnels through the proxy, and a way to close its connection
 * to the proxy. The agent opens that connection before the request has a
 * socket and keeps it until the proxy answers CONNECT, so destroying the
 * request leaves a proxy that never answers holding the process open.
 */
export function createProxyAgent(proxyUrl: string): ClosableProxyAgent {
    // Without AbortController (old Node), the connection stays open as before
    const controller = typeof AbortController === 'function' ? new AbortController() : null;

    return {
        agent: new HttpsProxyAgent(proxyUrl, controller ? { signal: controller.signal } : undefined),
        close: () => {
            controller?.abort();
        }
    };
}
