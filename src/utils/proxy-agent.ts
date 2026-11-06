import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ClosableProxyAgent {
    agent: HttpsProxyAgent<string>;
    close: () => void;
}

// A proxy given as host:port is an HTTP proxy, as curl reads it. Parsed as it
// is, the host would become the URL's scheme and the agent would connect to
// localhost:80.
function withProxyScheme(proxyUrl: string): string {
    return /^[a-z][a-z\d+.-]*:\/\//i.test(proxyUrl) ? proxyUrl : `http://${proxyUrl}`;
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
        agent: new HttpsProxyAgent(withProxyScheme(proxyUrl), controller ? { signal: controller.signal } : undefined),
        close: () => {
            controller?.abort();
        }
    };
}
